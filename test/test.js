const firebase = require('@firebase/testing');
const fs = require('fs');

/*
 * ============
 *    Setup
 * ============
 */
const projectId = 'emulator-testing-1';
const firebasePort = require('../firebase.json').emulators.firestore.port;

const port = firebasePort || 8080;
const coverageUrl = `http://localhost:${port}/emulator/v1/projects/${projectId}:ruleCoverage.html`;

const rules = fs.readFileSync('firestore.rules', 'utf8');

/**
 * Creates a new app with authentication data matching the input.
 *
 * @param {object} auth the object to use for authentication (typically {uid: some-uid})
 * @return {object} the app.
 */
function authedApp(auth) {
  return firebase.initializeTestApp({ projectId, auth }).firestore();
}

/*
 * ============
 *  Test Cases
 * ============
 */
beforeEach(() => {
  // Clear the database between tests
  return firebase.clearFirestoreData({ projectId })
});

beforeAll(() => {
  return firebase.loadFirestoreRules({ projectId, rules })
});

afterAll(() => {
  console.log(`View rule coverage information at ${coverageUrl}\n`);
  return Promise.all(firebase.apps().map(app => app.delete()));
});

describe('My app', () => {
  it('require users to log in before creating a profile', async () => {
    const db = authedApp(null);
    const profile = db.collection('users').doc('alice');
    await firebase.assertFails(profile.set({ birthday: 'January 1' }));
  });

  it('should enforce the createdAt date in user profiles', async () => {
    const db = authedApp({ uid: 'alice' });
    const profile = db.collection('users').doc('alice');
    await firebase.assertFails(profile.set({ birthday: 'January 1' }));
    await firebase.assertSucceeds(true);
  });

  it('should only let users create their own profile', async () => {
    const db = authedApp({ uid: 'alice' });
    await firebase.assertSucceeds(
      db
        .collection('users')
        .doc('alice')
        .set({
          birthday: 'January 1',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
    );
    await firebase.assertFails(
      db
        .collection("users")
        .doc("bob")
        .set({
          birthday: "January 1",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
    );
  });

  it('should let anyone read any profile', async () => {
    const db = authedApp(null);
    const profile = db.collection('users').doc('alice');
    await firebase.assertSucceeds(profile.get());
  });

  it('should let anyone create a room', async () => {
    const db = authedApp({ uid: 'alice' });
    const room = db.collection('rooms').doc('firebase');
    await firebase.assertSucceeds(
      room.set({
        owner: "alice",
        topic: "All Things Firebase"
      })
    );
  });

  it('should force people to name themselves as room owner when creating a room', async () => {
    const db = authedApp({ uid: 'alice' });
    const room = db.collection('rooms').doc('firebase');
    await firebase.assertFails(
      room.set({
        owner: "scott",
        topic: "Firebase Rocks!"
      })
    );
  });

  it('should not let one user steal a room from another user', async () => {
    const alice = authedApp({ uid: 'alice' });
    const bob = authedApp({ uid: 'bob' });

    await firebase.assertSucceeds(
      bob
        .collection("rooms")
        .doc("snow")
        .set({
          owner: "bob",
          topic: "All Things Snowboarding"
        })
    );

    await firebase.assertFails(
      alice
        .collection("rooms")
        .doc("snow")
        .set({
          owner: "alice",
          topic: "skiing > snowboarding"
        })
    );
  });
});
