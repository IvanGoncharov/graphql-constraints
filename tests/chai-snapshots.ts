import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as stringify from 'json-stable-stringify';

let snapshots = {};
let pathToSnaps = "";

export type ChaiSnapshotsOptions = {
  pathToSnaps?: string;
  devMode?: boolean;
}

function getSnapshot(key, options):object|null {
  let snapshotContents;
  let filename = path.join(options.pathToSnaps, key);
  try {
    snapshotContents = fs.readFileSync(filename, { flag: "r" }).toString();
  } catch(e) {
    return null;
  }
  if (snapshotContents && snapshotContents.length > 0) {
    return JSON.parse(snapshotContents);
  } else {
    return null;
  }
}

export const SnapshotMatchers = function (options: ChaiSnapshotsOptions = {}) {
  options.pathToSnaps = options.pathToSnaps || "./src/__tests__/snaps.json";
  options.devMode = options.devMode;
  pathToSnaps = options.pathToSnaps;
  return function (chai) {
    chai.Assertion.addMethod('matchSnapshotJSON', function (key?: string) {
      const obj = this._obj;
      chai.expect(obj).to.be.ok;
      const path = key;
      let snapshot = getSnapshot(path, options);
      if (!snapshot || options.devMode) {
        // TODO think if should fail or recreate if no snapshot
        snapshots[path] = snapshot = _.cloneDeep(obj);
      };
      const expected = stringify(snapshot, {space: '  '});
      const actual = stringify(obj, {space: '  '});
      chai.expect(expected, "Expected snapshot to match").to.eql(actual);
    });
  }
}

if (after) {
  after(function () {
    if (!Object.keys(snapshots).length) return;
    console.log('  Saving snapshots');
    for (let file in snapshots) {
      const data = stringify(snapshots[file], {space: '  '});
      let fileName = path.join(pathToSnaps, file);
      mkdirp.sync(path.dirname(fileName));
      fs.writeFileSync(fileName, data, {flag: "w"});
      console.log('    -', fileName);
    }
  });
}

declare global {
  module Chai {
    interface Assertion {
      matchSnapshotJSON(key?: string):Assertion;
    }
  }
}
