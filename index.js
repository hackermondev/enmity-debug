import { hostname } from "os";
import repl from "repl";
import { WebSocketServer } from "ws";
import colors from "ansi-colors";
const { cyan, red, yellow, bold: { blue } } = colors;

let isPrompting = false;

// Utility functions for more visually pleasing logs
// Get out of user input area first if prompt is currently being shown
const colorize = (data, source, color) => color(`[${source}] `) + data;
const safeLog = (data) => console.log((isPrompting ? "\n" : "") + data);

const discordColorize = (data) => {
  let { message, level } = JSON.parse(data);
  // Normal logs don't need extra colorization
  switch (level) {
    case 0: // Info
      message = cyan(message);
      break;
    case 2: // Warning
      message = yellow(message);
      break;
    case 3: // Error
      message = red(message);
      break;
  }
  return colorize(message, "Discord", blue);
};
const discordLog = (data) => safeLog(discordColorize(data));

const debuggerColorize = (data) => colorize(data, "Debugger", blue);
const debuggerLog = (data) => safeLog(debuggerColorize(data));
const debuggerError = (err, isReturning) => {
  safeLog(colorize(red("Error"), "Debugger", red.bold));
  if (isReturning) {
    return err;
  }
  console.error(err);
}


// Display welcome message and basic instructions
console.log("Welcome to the unofficial Enmity debugger.")
console.log("Press Ctrl+C to exit.")
console.log(`Connect to this debugger from Discord on your iOS device
by typing the following slash command in the chat box:

  /websocket host:${hostname()}:9090
`);

// Create websocket server and REPL, and wait for connection
const wss = new WebSocketServer({ port: 9090 });
wss.on("connection", (ws) => {
  debuggerLog("Connected to Discord over websocket, starting debug session");

  isPrompting = false; // REPL hasn't been created yet
  let finishCallback;

  // Handle logs returned from Discord client via the websocket
  ws.on("message", (data) => {
    try {
      if (finishCallback) {
        finishCallback(null, data);
        finishCallback = undefined;
      } else {
        discordLog(data);
      }
    } catch (e) {
      debuggerError(e, false);
    }
    isPrompting = true;
    rl.displayPrompt();
  });

  // Create the REPL
  const rl = repl.start({
    eval: (input, ctx, filename, cb) => {
      try {
        if (!input.trim()) {
          cb();
        } else {
          isPrompting = false;
          ws.send(`const res=(0, eval)(${JSON.stringify(input)});console.log(vendetta.metro.findByProps("inspect").inspect(res,{showHidden:true}));res`);
          finishCallback = cb;
        }
      } catch (e) {
        cb(e);
      }
    },
    writer: (data) => {
      return (data instanceof Error) ? debuggerError(data, true) : discordColorize(data);
    }
  });

  isPrompting = true; // Now the REPL exists and is prompting the user for input
  
  rl.on("close", () => {
    debuggerLog("Closing debugger, press Ctrl+C to exit");
  });

  ws.on("close", () => {
    debuggerLog("Websocket has been closed");
    isPrompting = false;
    rl.close();
  });
});

debuggerLog("Ready to connect");
