#!/usr/bin/env node

/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as bigquery from "@google-cloud/bigquery";
import * as firebase from "firebase-admin";
import * as inquirer from "inquirer";
import * as path from "path";

import { existsSync, readdirSync } from "fs";

import {
  FirestoreBigQuerySchemaViewFactory,
  FirestoreSchema,
} from "./schema";

const BIGQUERY_VALID_CHARACTERS = /^[a-zA-Z0-9_]+$/;
const FIRESTORE_VALID_CHARACTERS = /^[^\/]+$/;

const validateInput = (value: any, name: string, regex: RegExp) => {
  if (!value || value === "" || value.trim() === "") {
    return `Please supply a ${name}`;
  }
  if (!value.match(regex)) {
    return `The ${name} must only contain letters or spaces`;
  }
  return true;
};

const questions = [
  {
    message: "What is your Firebase project ID?",
    name: "projectId",
    type: "input",
    validate: (value) =>
      validateInput(value, "project ID", FIRESTORE_VALID_CHARACTERS),
  },
  {
    message:
      "What is the ID of the BigQuery dataset the raw changelog lives in? (The dataset and the raw changelog must already exist!)",
    name: "datasetId",
    type: "input",
    validate: (value) =>
      validateInput(value, "dataset", BIGQUERY_VALID_CHARACTERS),
  },
  {
    message:
      "What is the name of the Cloud Firestore Collection that you would like to generate a schema view for?",
    name: "collectionName",
    type: "input",
    validate: (value) =>
      validateInput(value, "dataset", BIGQUERY_VALID_CHARACTERS),
  },
  {
    message:
      "Have you installed all your desired schemas in ./schemas/*.json?",
    name: "confirmed",
    type: "confirm",
  }
];

async function run(): Promise<number> {
  const schemaDirectory = [process.cwd(), "schemas"].join('/');
  const schemaDirExists = existsSync(schemaDirectory);
  if (!schemaDirExists) {
    console.log(`Expected directory "${schemaDirectory}" not found!`);
    process.exit(1);
  }

  const {
    projectId,
    datasetId,
    collectionName,
    confirmed
  } = await inquirer.prompt(questions);

  // Set project ID so it can be used in BigQuery intialization
  process.env.PROJECT_ID = projectId;
  // BigQuery aactually requires this variable to set the project correctly.
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  // Initialize Firebase
  firebase.initializeApp({
    credential: firebase.credential.applicationDefault(),
    databaseURL: `https://${projectId}.firebaseio.com`,
  });

  // @ts-ignore string not assignable to enum
  const schemas: { [schemaName: string]: FirestoreSchema} = readSchemas(schemaDirectory);
  if (Object.keys(schemas).length === 0) {
    console.log(`Found no schemas in ${schemaDirectory}!`);
  }
  const viewFactory = new FirestoreBigQuerySchemaViewFactory();

  for (const schemaName in schemas) {
    await viewFactory.initializeSchemaViewResources(datasetId, collectionName, schemaName, schemas[schemaName]);
  }
  return 0;
};

function readSchemas(directory: string): { [schemaName: string]: FirestoreSchema } {
  let results = {};
  let files = readdirSync(directory);
  let schemaNames = files.map(fileName => path.basename(fileName).split('.').slice(0, -1).join('.').replace(/-/g,'_'));
  for (var i = 0; i < files.length; i++) {
    const schema: FirestoreSchema = require([directory, files[i]].join('/'));
    results[schemaNames[i]] = schema;
  }
  return results;
}

run()
  .then((result) => {
    console.log("done.");
    process.exit();
  })
  .catch((error) => {
    console.log(JSON.stringify(error));
    console.error(error.message);
    process.exit();
  });
