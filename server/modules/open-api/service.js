
"use strict";

const Service = require("moleculer").Service;
const DataModel = require("./dataModel");

const GqlTypes = require("./helpers/graphQlTypeGenerator");
const FvSchema = require("./helpers/fastest-validator-schema");


class ServiceDataCentric extends Service {
  constructor(broker, {definition}) {
    super(broker);
    this.schemas = {};
    this.definition = {
      name: (definition.info.title)?`test${definition.info.title}`:`newService-${Date.now()}`,
      version: definition.info.version,
      actions: {
        inputSan: {
          handler(ctx) {
            const dataModelName = ctx.params.dataModel;
            const data = ctx.params.data;
            return this[dataModelName](data);
          }
        }
      },
      methods: {
        beforeHook: this.beforeHook,
      },
      hooks: {
        before: {
          "api.create": ["beforeHook"],
          "api.update": ["beforeHook"],
          "api.read": ["beforeHook"],
          "api.read-urlMaker": ["beforeHook"],
          "api.search": ["beforeHook"],
          "api.search-urlMaker": ["beforeHook"],
          "api.delete": ["beforeHook"],
        },
      },
      settings: {
        restApi: {
          routes: [],
          openapi: definition,
        }
      },
    };
    this.processSchemas(definition.components.schemas)
  }

  /*******/
  beforeHook(ctx) {
    ctx.meta.hydrateDepth = ctx.meta.hydrateDepth || 0;
    if (ctx.meta.$requestHeaders && ctx.meta.$requestHeaders['hydrate-depth']) {
      ctx.meta.hydrateDepth = parseInt(ctx.meta.$requestHeaders['hydrate-depth']);
    }
    ctx.meta.$span = {
      requestID: ctx.requestID,
      id: ctx._id,
      level: ctx.level,
    }
    ctx.meta.isGraphQl = (ctx.meta.graphQL) ? true : false;
    ctx.meta.isHttp = (ctx.meta.$requestHeaders) ? true : false;
    ctx.meta.$responseHeaders = {
      ["x-api-version"]: version,
    };
    if (!ctx.meta.isHttp && !ctx.params.body && ctx.params.input) {
      ctx.params.body = ctx.params.input;
    }
    if (!ctx.meta.isHttp && !ctx.params.params && ctx.params && Object.keys(ctx.params).length > 0) {
      ctx.params.params = ctx.params
    }
  }
  /*******/

  addAction(name, fn) {
    this.definition.actions[name] = fn;
  }
  deleteAction(name) {
    if (this.definition.actions[name]) {
      delete this.definition.actions[name];
      return true;
    }
    return false;
  }

  addMethod(name, fn) {
    this.definition.methods[name] = fn;
  }
  deleteMethod(name) {
    if (this.definition.methods[name]) {
      delete this.definition.methods[name];
      return true;
    }
    return false;
  }

  getSchemaByPath(ref) {
  }
  processSchemas(schemaList) {
    Object.keys(schemaList)
    .sort((itemA, itemB) => {
      const schemaA = JSON.stringify(schemaList[itemA]);
      const schemaB = JSON.stringify(schemaList[itemB]);
      if (!/\$ref/.test(schemaA)) {
        if (!/\$ref/.test(schemaB)) {
          return 0;
        } else {
          return -1;
        }
      }
      else {
        if (!/\$ref/.test(schemaB)) {
          return 1;
        } else {
          const regxpA = new RegExp(`${itemA}`)
          const regxpB = new RegExp(`${itemB}`)
          if (regxpA.test(schemaB)) {
            return -1;
          } else if (regxpB.test(schemaA)) {
            return 1;
          }
          return 0;
        }
      }
    })
    .forEach((schemaKey) => {
      this.addSchema(schemaKey, schemaList[schemaKey])
    })
  }
  addSchema(name, schema) {
    console.log("~~~~", name);
    let dataModels = {};
    const refs = JSON.stringify(schema)
    .match(/"\$ref"\s*:\s*"#\/components\/schemas\/([a-zA-Z0-9\-_]+)"/g)
    if (refs) {
      dataModels = refs
      .reduce((acc, item) => {
        const refNameMatchs = item.replace(/"/g, "").match(/([a-zA-Z0-9\-_]+)$/g);
        if (refNameMatchs) {
          const refName = refNameMatchs.shift();
          if (this.schemas[refName]) {
            return Object.assign(acc, {[refName]: this.schemas[refName]});
          }
        }
        return acc;
      }, {});
    }
    console.log("++");
    console.log(schema);
    this.schemas[name] = new DataModel(
      name,
      schema,
      dataModels,
      [
        {key: "inputValidation", regexp: /all|write/, builder: new FvSchema(name)},
        {key: "outputValidation", regexp: /all|read/, builder: new FvSchema(name)},
        {key: "graphQLTypes", regexp: /all|read/, builder: new GqlTypes(name)},
      ]
    );
    console.log("~~~~");
  }
  deleteSchema(name) {
    if (this.schemas[name]) {
      delete this.schemas[name];
    }
  }

  start() {
    this.parseServiceSchema(this.definition);
  }
  getDefintion() {
    return this.definition;
  }
}

module.exports = ServiceDataCentric;
