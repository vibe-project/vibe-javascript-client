// The index.js tests react.js as a Node.js client and 
// requires a running react server
// 
// To run react server, execute the command in another console
//     node server

var qunit = require("qunit");

qunit.run({
	deps: {path: __dirname + "/webapp/assets/helper.js", namespace: "helper"},
	code: {path: __dirname + "/../react.js", namespace: "react"},
	tests: [__dirname + "/webapp/unit/client.js", __dirname + "/webapp/unit/server.js"]
});
