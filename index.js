require("dotenv").config();
const { Client } = require("@notionhq/client");

// Initializing a client
console.log(`Initializing Notion client.`);
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

var last_request_made = Date.now();

var knownBlocks = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkIfOkayToSendRequest() {
  if (Date.now() - last_request_made < 1000) {
    return false;
  }
  return true;
}

async function startBackupProcess(rootPageIDToCheck) {
  console.log(`Starting backup`);
  await perPage(rootPageIDToCheck);
}

async function perPage(pageID) {
  var currentPageMutable = {};
  //get page from notion
  if (checkIfOkayToSendRequest() == false) {
    await sleep(1000);
  }
  console.log(`Backing up page with ID ${pageID}`);
  last_request_made = Date.now();
  var currentPageNotionResponse = await notion.pages.retrieve({
    page_id: pageID,
  });
  currentPageMutable = currentPageNotionResponse;
  // console.log(currentPageNotionResponse);
  var blockResponse = await perBlock(pageID);
  console.log(JSON.stringify(blockResponse));
}

async function perBlock(blockID) {
  if (knownBlocks.get(blockID) !== undefined) {
    console.warn("this shouldnt happen");
    return knownBlocks.get(blockID);
  }
  var currentBlockMutable = {};
  var currentBlockExtraProperties = { children: [] };
  //get block from notion
  if (checkIfOkayToSendRequest() == false) {
    await sleep(1000);
  }
  console.log(`run perBlock on ${blockID}`);
  last_request_made = Date.now();
  var currentBlockNotionResponse = await notion.blocks
    .retrieve({ block_id: blockID })
    .catch((error) => {
      console.error(error);
      return {
        ...currentBlockNotionResponse,
        ...currentBlockExtraProperties,
      };
    });
  currentBlockMutable = currentBlockNotionResponse;
  // console.log(currentBlockMutable);
  //check for children
  if (currentBlockMutable.has_children == false)
    return { ...currentBlockNotionResponse, ...currentBlockExtraProperties };
  var nextResult = await perBlockChildrenRoutine(
    currentBlockNotionResponse,
    currentBlockExtraProperties,
    blockID, true
  );
  knownBlocks.set(blockID, nextResult);
  return nextResult;
}

async function perBlockChildrenRoutine(
  currentBlockNotionResponse,
  currentBlockExtraProperties,
  blockID, fromperblock=false
) {
  // console.log(knownBlocks.get(blockID));
  console.log(`run perBlockChildrenRoutine${fromperblock == true ? ' from perBlock' : ''}`)
  if (knownBlocks.get(blockID) !== undefined) {
    console.warn("this shouldnt happen");
    return knownBlocks.get(blockID);
  }
  // console.log(`Iterating over block children`);
  var keepCheckingForBlockChildren = true;
  var nextCursorToUse = null;
  while (keepCheckingForBlockChildren == true) {
    var currentBlockChildrenMutable;
    var paramsToUse = {
      block_id: blockID,
      page_size: 100,
    };
    if (nextCursorToUse !== null) {
      paramsToUse["cursor"] = nextCursorToUse;
    }
    //get block children from notion
    if (checkIfOkayToSendRequest() == false) {
      await sleep(1000);
    }
    // console.log(blockID);
    last_request_made = Date.now();
    var currentBlockChildrenNotionResponse = await notion.blocks.children
      .list(paramsToUse)
      .catch((error) => {
        console.error(error);
        return {
          ...currentBlockNotionResponse,
          ...currentBlockExtraProperties,
        };
      });
    currentBlockChildrenMutable = currentBlockChildrenNotionResponse;
    var newResultsArray = [];
    // console.log(currentBlockChildrenMutable);
    var inDepthSearchPromises = [];
    currentBlockChildrenMutable.results.forEach((item) => {
      if (item.has_children) {
        console.log(`push ${item.id} to queue`);
        inDepthSearchPromises.push(
          perBlockChildrenRoutine(item, { children: [] }, item.id)
        );
      } else {
        newResultsArray.push(item)
      }
    });
    /* for (i = 0; i < currentBlockChildrenMutable.results.length; i++) {
      console.log(`i max = ${currentBlockChildrenMutable.results.length}`)
      console.log(`i = ${i}`)
      var currentBlockChildBasic = currentBlockChildrenMutable.results[i];
      if (currentBlockChildBasic.has_children == true) {
        console.log(`Running in-depth children check on block ${currentBlockChildBasic.id}`)
        var currentBlockChildAdditionalChildrenCheck = await perBlock(currentBlockChildBasic.id)
        newResultsArray.push(currentBlockChildAdditionalChildrenCheck)
      } else {
        newResultsArray.push(currentBlockChildBasic)
      }
    } */
    Promise.all(inDepthSearchPromises).then((allDataBack) => {
      console.log("getting promiseall");
      // console.log(allDataBack);
      newResultsArray = [...newResultsArray, ...allDataBack.flat()];
      for (var i = 0; i < newResultsArray.length; i++) {
        knownBlocks.set(newResultsArray[i].id, newResultsArray[i]);
      }

      currentBlockExtraProperties.children = [
        ...currentBlockExtraProperties.children,
        ...newResultsArray,
      ];
      if (currentBlockChildrenMutable.has_more == true) {
        nextCursorToUse = currentBlockChildrenMutable.next_cursor;
      } else {
        keepCheckingForBlockChildren = false;
      }
    });
  }
  return { ...currentBlockNotionResponse, ...currentBlockExtraProperties };
}

startBackupProcess(process.env.ROOT_PAGE_ID);
