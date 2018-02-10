// @flow
import type { Middleware } from 'redux';
import type { PerReducerSyncConfig } from 'types/sync';
import { mapValues, values, flatten, fromPairs, pick } from 'lodash';
import { firestore, auth, SYNC_COLLECTION_NAME } from 'utils/firebase';
import { syncDataReceived } from 'actions/sync';

// Returns a map of action types to reducer names.
// No two reducers should watch for the same action.
export function mapActionsToReducers(config: PerReducerSyncConfig): { [string]: string } {
  return fromPairs(
    flatten(
      values(
        // Create { reducerName: [[actionType, reducerName]] } object
        mapValues(config, (syncConfig, reducerName) =>
          syncConfig.actions.map((actionType) => [actionType, reducerName]),
        ),
      ),
    ),
  );
}

function startReceivingState(uid: string, onDataReceived: (data: Object) => mixed): Function {
  return firestore()
    .collection(SYNC_COLLECTION_NAME)
    .doc(uid)
    .onSnapshot(
      (doc) => {
        // Ignore docs that don't exist
        if (!doc.exists) return;
        // Ignore changes that originated locally
        // https://firebase.google.com/docs/firestore/query-data/listen#events-local-changes
        if (doc.metadata.hasPendingWrites) return;
        onDataReceived(doc.data());
      },
      // TODO: Handle errors properly
      (err) => alert(`Receive error ${err}`),
    );
}

function sendStateToServer(reducerName: string, stateToSend: Object) {
  const loggedInUser = auth().currentUser;
  // Send data to server
  firestore()
    .collection(SYNC_COLLECTION_NAME)
    .doc(loggedInUser.uid)
    .update({
      [reducerName]: stateToSend,
      updateTimestamp: firestore.FieldValue.serverTimestamp(),
    })
    // .then(() => console.log("Sent data!", stateToSend))
    // TODO: Handle errors properly
    .catch((err) => alert(`Send error ${err}`));
}

export default function createSyncMiddleware(perReducerConfig: PerReducerSyncConfig) {
  let unsubscribeSync: ?Function; // Function to stop subscribing to Firebase update snapshots
  const actionToReducerMap = mapActionsToReducers(perReducerConfig);

  const syncMiddleware: Middleware<*, *, *> = (store) => {
    auth().onAuthStateChanged((user) => {
      if (user) {
        // User is signed in.
        unsubscribeSync = startReceivingState(user.uid, (data) =>
          store.dispatch(syncDataReceived(data)),
        );
      } else {
        // No user is signed in.
        // eslint-disable-next-line no-lonely-if
        if (unsubscribeSync) unsubscribeSync();
      }
    });

    return (next) => (action) => {
      const result = next(action);

      // Send state if logged in and action is watched
      const newState = store.getState();
      const loggedInUser = auth().currentUser;
      const reducerName = actionToReducerMap[action.type];
      if (loggedInUser && reducerName) {
        const config = perReducerConfig[reducerName];
        const reducerState = newState[reducerName];
        const stateToSend = config.keyPaths ? pick(reducerState, config.keyPaths) : reducerState;
        sendStateToServer(reducerName, stateToSend);
      }

      return result;
    };
  };

  return syncMiddleware;
}