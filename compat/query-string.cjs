// Expo Router 5's fork expects named CommonJS methods. The patched
// query-string 9 package exports the same methods on its ESM default object.
module.exports = require("query-string").default;
