import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

import { expect, use as chaiUse } from 'chai';
import * as snapshots from './chai-snapshots';

const argv = require('yargs').argv

chaiUse(snapshots.SnapshotMatchers({
  pathToSnaps: './tests/__snapshots/',
  devMode: !!argv.update
}));

const dataDir = path.join(__dirname, 'data');
const testIDLs = glob.sync('**/idl.graphql');

function test(name, idl, query, config) {
  const testInput = {
    idl, query, config
  };
  const res = JSON.parse(
    execSync(argv.command, {input: JSON.stringify(testInput)}).toString()
  );
  expect(res).to.matchSnapshotJSON(name);
}

testIDLs.forEach(idlFile => {
  const dir = path.dirname(idlFile);
  const groupName = path.relative(dataDir, dir);
  const idl = fs.readFileSync(idlFile).toString();
  describe(groupName, () => {
    const queriesGlob = path.join(dir, '*.query.graphql');
    const queries = glob.sync(queriesGlob);
    for (let queryFileName of queries) {
      let snapshotPath = path.join(groupName, path.basename(queryFileName, '.query.graphql')) + '.json';
      it(queryFileName, () => {
        let query = fs.readFileSync(queryFileName).toString();
        test(snapshotPath, idl, query, {});
      });
    }
  });
});