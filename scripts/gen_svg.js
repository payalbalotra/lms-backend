const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><polygon points="0,0 8,8 16,0" fill="#C24A30"/></svg>';
console.log(Buffer.from(svg).toString('base64'));
