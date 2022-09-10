require("dotenv").config();
const { Client } = require("@notionhq/client");

// Initializing a client
console.log(`Initializing Notion client.`);
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function main() {
    var currentBlockNotionResponse = await notion.blocks
    .retrieve({ block_id: '7f812c44e5b94122a9e3dc345b809edc' })
    .catch((error) => {
      console.error(error);
    });
    console.log(currentBlockNotionResponse)
    var paramsToUse = {
        block_id: '7beb71a1-a9f5-4c9a-a0f4-dd6037624a51',
        page_size: 100,
      };
    var currentBlockChildrenNotionResponse = await notion.blocks.children
      .list(paramsToUse)
      .catch((error) => {
        console.error(error);
        return {...currentBlockNotionResponse, ...currentBlockExtraProperties};
      });
    console.log(JSON.stringify(currentBlockChildrenNotionResponse))
}   

main()