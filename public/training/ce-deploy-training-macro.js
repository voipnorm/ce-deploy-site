import xapi from 'xapi';

const TRAINING_MESSAGE = 'CE-Deploy training macro started';

console.log(TRAINING_MESSAGE);

xapi.Status.SystemUnit.State.NumberOfActiveCalls.get()
  .then((activeCalls) => {
    console.log(`CE-Deploy training: active calls = ${activeCalls}`);
  })
  .catch((error) => {
    console.error(`CE-Deploy training: status check failed: ${error.message}`);
  });

