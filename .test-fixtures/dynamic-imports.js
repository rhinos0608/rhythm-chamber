
// Static import
import { staticImport } from './static.js';

// Dynamic import examples
const module1 = await import('./dynamic1.js');
const module2 = await import(`./dynamic2.js`);

// Dynamic import in function
async function loadModule() {
  return import('./dynamic3.js');
}

// Dynamic import with .then()
import('./dynamic4.js').then(module => {
  console.log(module);
});

// Complex template literal (should not be detected - has expression)
const name = 'test';
import(`./${name}.js`);
