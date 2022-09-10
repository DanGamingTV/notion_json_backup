require("dotenv").config();
const fs = require("fs/promises");
const { Client } = require("@notionhq/client");
const maxRequestsPerSecond = 2.5;
const timeToWaitPerRequest = (1 / maxRequestsPerSecond) * 1000;

// Initializing a client
console.log(`Initializing Notion client.`);
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

var last_request_made = Date.now();

function sleep(ms, fromFunc) {
  console.log(
    `Sleeping for ${ms / 1000} second${ms > 1000 ? "s" : ""} - from ${fromFunc}`
  );
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkIfOkayToSendRequest() {
  // console.log(`Checking if okay to send request`)
  if (Date.now() - last_request_made < timeToWaitPerRequest) {
    return false;
  }
  return true;
}

async function startBackupProcess(rootPageIDToCheck) {
  console.log(`Starting backup`);
  await perPage(rootPageIDToCheck);
}

async function perPage(pageID) {
  //get page from notion
  while (checkIfOkayToSendRequest() == false) {
    // console.log('nup')
    // await sleep(timeToWaitPerRequest, 'perBlock 90');
  }
  console.log(`Backing up page with ID ${pageID}`);
  last_request_made = Date.now();
  // var currentPageNotionResponse = await notion.pages.retrieve({
  // page_id: pageID,
  // });
  // console.log(currentPageNotionResponse);
  if (pageID == undefined) {
    console.trace(`undefined page id somehow`);
  }
  var blockResponse = await perBlock(pageID);
  console.log("assuming that all data is now gathered");
  // console.log(JSON.stringify(blockResponse));
  try {
    await fs.writeFile("./backups/latest.json", JSON.stringify(blockResponse));
  } catch (err) {
    console.error(err);
  }
}

async function getPagesInDatabase(databaseID) {
  console.log(`Getting pages from database ${databaseID}`);
  var databasePageList = [];
  while (checkIfOkayToSendRequest() == false) {
    // console.log('nup')
    // await sleep(timeToWaitPerRequest, 'perBlock 90');
  }
  last_request_made = Date.now();
  var currentDatabasePages = await notion.databases
    .query({
      database_id: databaseID,
    })
    .catch((error) => {
      console.error(error);
      return {};
    });
  databasePageList = [...databasePageList, ...currentDatabasePages.results];
  while (currentDatabasePages.has_more) {
    var cursorToUse = currentDatabasePages.next_cursor;
    console.log(
      `Database has more than 100 entries. Getting the next 100. Using cursor ${cursorToUse}`
    );
    while (checkIfOkayToSendRequest() == false) {
      // console.log('nup')
      // await sleep(timeToWaitPerRequest, 'perBlock 90');
    }
    last_request_made = Date.now();
    var currentDatabasePages = await notion.databases.query({
      database_id: databaseID,
      start_cursor: cursorToUse,
    });
    databasePageList = [...databasePageList, currentDatabasePages.results];
  }
  return databasePageList;
}

async function perBlock(blockID, options={}) {
  if (blockID == undefined) {
    console.trace(`blockID is somehow undefined. ???`);
  }
  var currentBlockExtraProperties = {}
  if ('databasePage' in options) {
    currentBlockExtraProperties = options.databasePage
  }
  currentBlockExtraProperties = {...currentBlockExtraProperties, children: [] };
  //get block from notion
  while (checkIfOkayToSendRequest() == false) {
    // console.log('nup')
    // await sleep(timeToWaitPerRequest, 'perBlock 90');
  }
  console.log(`run perBlock on ${blockID}`);
  last_request_made = Date.now();
  var currentBlockNotionResponse = await notion.blocks
    .retrieve({ block_id: blockID })
    .catch((error) => {
      console.error(error);
      console.log(`Errored, so returning.`);
      return {
        ...currentBlockNotionResponse,
        ...currentBlockExtraProperties,
      };
    });
  var currentBlockID = blockID;
  if (currentBlockNotionResponse.type == "child_database") {
    console.log(`hit db`);
    var databasePageResult = await getPagesInDatabase(blockID).catch(
      (error) => {
        console.error(error);
        return currentBlockNotionResponse;
      }
    );
    console.log(`Creating task queue`);
    var databasePageQueue = [];
    for (var i = 0; i < databasePageResult.length; i++) {
      var currentDatabasePage = databasePageResult[i];
      if (currentDatabasePage.id == undefined) {
        console.trace(`undefined database page id somehow. :/`);
      } else {
        databasePageQueue.push(perBlock(currentDatabasePage.id, {databasePage: currentDatabasePage}));
      }
    }
    console.log(`Starting queue`);
    return Promise.all(databasePageQueue).then((resultingData) => {
      console.log(`Gotten database page data ${currentBlockID}`);
      resultingData = resultingData.flat();
      console.log(`Returning child block data on ${currentBlockID}`);
      return { ...currentBlockNotionResponse, ...{ children: resultingData } };
    });
  }
  //check for children
  if (currentBlockNotionResponse.has_children == false) {
    console.log(`No children on ${currentBlockID}, so returning.`);
    return { ...currentBlockNotionResponse, ...currentBlockExtraProperties };
  }
  var nextResult = await perBlockChildrenRoutine(
    currentBlockNotionResponse,
    blockID,
    true
  );
  console.log(`Children coroutine finished, so returning.`);
  return nextResult;
}

async function perBlockChildrenRoutine(currentBlock, currentBlockID) {
  console.log(`run perBlockChildrenRoutine on ${currentBlockID}`);
  console.log(`getting children from this block`);
  // precheck
  while (checkIfOkayToSendRequest() == false) {
    // console.log('nup')
    // await sleep(timeToWaitPerRequest, 'perBlock 90');
  }
  last_request_made = Date.now();
  var childrenResultList = [];
  //get first round of data from notion
  console.log(`Getting data from notion`);
  var currentBlockChildren = await notion.blocks.children
    .list({ block_id: currentBlockID, page_size: 100 })
    .catch((error) => {
      console.error(error);
      return currentBlock;
    });
  childrenResultList = [...childrenResultList, ...currentBlockChildren.results];
  let tempPrintArray = [];
  for (var i = 0; i < childrenResultList.length; i++) {
    tempPrintArray.push(childrenResultList[i].id);
  }
  // if there are more than 100 blocks
  while (currentBlockChildren.has_more) {
    var cursorToUse = currentBlockChildren.next_cursor;
    while (checkIfOkayToSendRequest() == false) {
      // console.log('nup')
      // await sleep(timeToWaitPerRequest, 'perBlock 90');
    }
    last_request_made = Date.now();
    var currentBlockChildren = await notion.blocks.children
      .list({
        block_id: currentBlockID,
        page_size: 100,
        start_cursor: cursorToUse,
      })
      .catch((error) => {
        console.error(error);
        return currentBlock;
      });
    childrenResultList = [
      ...childrenResultList,
      ...currentBlockChildren.results,
    ];
  }
  var listOfChildrenToReturn = [];
  var childDataGetQueue = [];
  // check if we need to get more child blocks
  console.log(`Creating task queue`);
  for (var i = 0; i < childrenResultList.length; i++) {
    var currentChildBlock = childrenResultList[i];
    if (
      currentChildBlock.has_children ||
      currentChildBlock.type == "child_database"
    ) {
      if (currentChildBlock.id == undefined) {
        console.trace(`undefined child block id here line 195`);
      }
      childDataGetQueue.push(perBlock(currentChildBlock.id));
    } else {
      listOfChildrenToReturn.push(currentChildBlock);
    }
  }
  console.log(`Starting queue`);
  return Promise.all(childDataGetQueue).then((resultingData) => {
    console.log(`Gotten child block data on ${currentBlockID}`);
    resultingData = resultingData.flat();
    listOfChildrenToReturn = [...listOfChildrenToReturn, ...resultingData];
    console.log(`Returning child block data on ${currentBlockID}`);
    return { ...currentBlock, ...{ children: listOfChildrenToReturn } };
  });
}

startBackupProcess(process.env.ROOT_PAGE_ID);
