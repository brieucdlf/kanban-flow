
"use strict";

const Service = require("moleculer").Service;
const DataModel = require("./dataModel");

const GQLSchema = require("./helpers/graphQlTypeGenerator");
const FvSchema = require("./helpers/fastest-validator-schema");

const actionFactories = require("./helpers/actionFactory");


class ServiceDataCentric extends Service {
  constructor(broker, {definition, mixins, adapter, ...args}) {
    super(broker);
    this.schemas = {};
    this.definition = {
      name: `${definition.info.title}`,
      version: definition.info.version,
      collection: definition.info.title,
      adapter: adapter(),
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
      mixins,
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
        $noVersionPrefix: true,
        idField: 'id',
        restApi: {
          routes: [],
          openapi: definition,
        }
      },
      ...args,
    };
    this.basePath = null;
    this.innerAliases = {
      [`GET /open-api`]: `${this.definition.name}.open-api`
    }
    this.processSchemas(definition.components.schemas)
    this.processPaths(definition.paths);
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
      ["x-api-version"]: ctx.service.version,
    };
    if (!ctx.meta.isHttp && !ctx.params.body && ctx.params.input) {
      ctx.params.body = ctx.params.input;
    }
    if (!ctx.meta.isHttp && !ctx.params.params && ctx.params && Object.keys(ctx.params).length > 0) {
      ctx.params.params = ctx.params
    }
  }
  /*******/
  processPaths(pathList) {
    const pathsTmp = [];
    Object.keys(pathList)
    .forEach((path) => {
      const actionList = pathList[path];
      Object.keys(actionList)
      .forEach((method) => {
        const action = actionList[method];
        const actionName = action.operationId.replace(`${this.definition.name}.`, '');
        pathsTmp.push(this.definePath(path, method, actionName));
        console.log("+++++++");
        console.log(path, method);
        this.addAction(actionName, method)
        this.parseParams(actionName, action.parameters);
        console.log("+++++++");
      })
    });
    pathsTmp.forEach(({method, path, action}) => {
      console.log("####", `${method} ${path.replace(this.basePath, '')}`, action);
      this.innerAliases[`${method} ${path.replace(this.basePath, '')}`] = action;
    })
    this.addPathsInsideDefinition();
  }
  addPathsInsideDefinition() {
    this.definition.settings.restApi.routes.push({
      path: this.basePath,
      mappingPolicy: "restrict",
      mergeParams: false,
      bodyParsers: {
          json: true
      },
      aliases: this.innerAliases,
    });
  }
  definePath(path, method, actionName) {
    // this.innerAliases[`${method.toUpperCase()} ${path}`] = `${this.definition.name}.${actionName}`;
    this.setMinimalBasepath(path);
    return {
      method: method.toUpperCase(),
      path: path.replace(/{([a-z0-9]+)}/g, ":$1"),
      action: `${this.definition.name}.${actionName}`,
    }
  }
  setMinimalBasepath(path) {
    if(this.basePath) {
      this.basePath = this.basePath.split('')
      .filter((item, i) => {
        if (path[i]) {
          return path[i] === item;
        }
        return false;
      })
      .join('');
    }
    else {
      this.basePath = path;
    }
  }


  addAction(name, method) {
    const definition = actionFactories.createAction(name, method);
    this.definition.actions[name] = definition;
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
    this.schemas[name] = new DataModel(
      name,
      schema,
      dataModels,
      [
        {key: "inputValidation", regexp: /all|write/, builder: new FvSchema(name)},
        {key: "outputValidation", regexp: /all|read/, builder: new FvSchema(name)},
        {key: "graphQLTypes", regexp: /all|read/, builder: new GQLSchema(name)},
        {key: "graphQLInput", regexp: /all|write/, builder: new GQLSchema(name, "Input")},
      ]
    );
  }
  deleteSchema(name) {
    if (this.schemas[name]) {
      delete this.schemas[name];
    }
  }

  parseParams(paramsDefintions, actionName) {
    console.log("parseParams");
  }

  start() {
    this.parseServiceSchema(this.definition);
    console.log("@@@@@@@@@@@@@@@@@");
    console.log(this.definition);
    console.log("@@@@@@@@@@@@@@@@@");
  }
  getDefintion() {
    return this.definition;
  }
}

module.exports = ServiceDataCentric;
