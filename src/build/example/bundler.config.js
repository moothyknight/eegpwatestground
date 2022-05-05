import {bundle} from '../bundlify.js'

bundle({
  entryPoints: ['app.js'],
  outfile: 'dist/app',
  bundleBrowser: true, //plain js format
  bundleESM: false, //.esm format
  bundleTypes: false, //entry point should be a ts or jsx (or other typescript) file
  bundleCommonJS: false, //cjs format
  bundleIIFE: false,     //iife format, this one is compiled temporarily otherwise for correct .d.ts compilation
  bundleNode: false  //platform = 'node' and any node externals not included. returns a .node.js file
})