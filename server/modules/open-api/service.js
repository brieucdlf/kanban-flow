
"use strict";

const Service = require("moleculer").Service;
const DataModel = require("./dataModel");

const GQLSchema = require("./helpers/graphQlTypeGenerator");
const FvSchema = require("./helpers/fastest-validator-schema");
const FilterJSON = require("./helpers/filterJSON");

const actionFactories = require("./helpers/actionFactory");
const {parseParameter} = require("./helpers/params");

const filterJSON = require("./middlewares/filter")

const graphQlMixins = require("./graphqlMixins");

class ServiceDataCentric extends Service {
  constructor(broker, {definition, mixins, adapter, bodyRequestFormat, bodyResponseFormat, ...args}) {
    const requestFormat  = (bodyRequestFormat)  ? bodyRequestFormat  : (ctx) => {};
    const responseFormat = (bodyResponseFormat) ? bodyResponseFormat : (ctx) => {};
    super(broker);
    this.gqlTypes = {};
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
        requestFormat,
        responseFormat,
      },
      mixins,
      hooks: {
        before: {
          "api.create": ["beforeHook", "requestFormat"],
          "api.update": ["beforeHook", "requestFormat"],
          "api.read": ["beforeHook"],
          "api.read-urlMaker": ["beforeHook"],
          "api.search": ["beforeHook"],
          "api.search-urlMaker": ["beforeHook"],
          "api.delete": ["beforeHook"],
        },
        after: {
          "api.create": [],
          "api.update": [],
          "api.read"  : [],
          "api.search": [],
          "api.delete": [],
        },
      },
      settings: {
        $noVersionPrefix: true,
        idField: 'id',
        graphql: {},
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
    this.injectGraphQLTypes();
    this.schemas = null;
    // console.log("@@@@@@@@@@@@@@@");
    // console.log(this.definition.settings.graphql.type);
    // console.log("~~~~~");
    // console.log(this.definition.settings.graphql.resolvers);
    // console.log("@@@@@@@@@@@@@@@");
  }
  parseInput(parseFn) {

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
        // console.log("+++++++");
        // console.log(path, method);
        const action = actionList[method];
        const actionName = action.operationId.replace(`${this.definition.name}.`, '');
        pathsTmp.push(this.definePath(path, method, actionName));
        this.addAction(actionName, method)
        this.parseParams(actionName, action.parameters);
        if (this.hasRequestBody(action)) {
          const schemaTmp = action.requestBody.content["application/json"].schema;
          //Handle actions params
          const inputModel = this.getSchemaByKey(
            schemaTmp,
            "inputValidation"
          );
          this.injectValidationModel(actionName, {body: {...inputModel,  strict: true}});
          //Create GQL Input types
          this.addToGQLModel(schemaTmp, 'input')
        }
        this.handleResponse(action.responses, actionName)
      })
    });
    pathsTmp.forEach(({method, path, action}) => {
      this.innerAliases[`${method} ${path.replace(this.basePath, '')}`] = action;
    })
    this.addPathsInsideDefinition();
  }
  hasRequestBody(action) {
    return (
      action.requestBody &&
      action.requestBody.content["application/json"] &&
      action.requestBody.content["application/json"].schema
    );
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
  injectValidationModel(actionName, model) {
    const action = this.definition.actions[actionName];
    action.params = Object.assign({}, action.params, model);
  }
  handleResponse(responses, actionName) {
    const responseCode = Object.keys(responses)[0];
    const responseSchema = responses[responseCode].content["application/json"].schema;
    const model = this.getSchemaByKey(responseSchema, "outputFilter")
    this.definition.hooks.after[actionName].push(function(ctx, res) {
      return filterJSON(model, res);
    });
    const links = responses[responseCode].links;
    this.handleLinks(responses[responseCode].links, actionName, responseSchema)

    this.addToGQLModel(responseSchema);
  }
  handleLinks(links, actionName, schema) {
    if (links) {
      const resolvers = Object.keys(links)
      .map((key) => {
        return {key, ...links[key]}
      })
      .map((linkDef) => {
        const params = Object.keys(linkDef.parameters)
        .map((key) => {
          const paramValue = linkDef.parameters[key];
          let localParam = false;
          if (/^\$response\.body#\/[a-zA-Z0-9]+/.test(paramValue)) {
            localParam = paramValue.match(/^\$response\.body#\/([a-zA-Z0-9]+)/)[1];
          }
          if (localParam) {
            return {
              key:localParam,
              value: key,
              type: "rootParams",
            }
          }
          const scalarType = schemaTypesToGrahlQLType(paramValue);
          if (paramValue.length > 0 && scalarType && scalarType.length > 0) {
            return {
              key:scalarType,
              value: key,
              type: "params",
            }
          }
          return {};
        })
        .reduce((acc, item) => {
          const value = {[item.key]: item.value}
          return {
            ...acc,
            [item.type]: Object.assign(value, acc[item.type]),
          }
        }, {rootParams: {}, params: {}});
        return {
          [linkDef.key]: {
            action: linkDef.operationId,
            ...params,
          }
        }
      })
      .reduce((acc, item) => Object.assign(acc, item), {})

      // Injection inside the GQL types (responses types)
      const dataModel = this.getSchema(schema, "graphQLTypes");
      Object.keys(resolvers)
      .forEach((resolverKey) => {
        const resolver = resolvers[resolverKey];
        const actionSplit = resolver.action.split('.')
        const isArray = (actionSplit[2]==='search');
        const type = `${isArray?'[':''}${actionSplit[0].substr(0, actionSplit[0].length-1)}${isArray?']':''}`
        dataModel.addResolver(resolverKey, type);
      });
      if (Object.keys(resolvers).length > 0) {
        const schemaName = dataModel.name;
        const currentResolvers = this.definition.settings.graphql.resolvers || {};
        this.definition.settings.graphql.resolvers = Object.assign(currentResolvers, {[schemaName]: resolvers})
      }

    }
  }
  injectGraphQLTypes() {
    const types = Object.values(this.gqlTypes)
    .join('');
    if (types.length > 0) {
      this.definition.settings.graphql.type = types;
    }
  }

  addToGQLModel(schema, prefix='type') {
    const key = schema.$ref;
    const def = this.getSchemaByKey(
      schema,
      (prefix==='input')?"graphQLInput":"graphQLTypes"
    );
    if (!this.gqlTypes[`${prefix}${key}`]) {
      this.gqlTypes[`${prefix}${key}`] = def;
    }
  }

  addAction(name, method) {
    const definition = actionFactories.createAction(name, method, this.definition.name);
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

  getSchema(schema, key) {
    const modelName = schema.$ref.replace("#/components/schemas/", "")
    return this.schemas[modelName].getSchemaBuilderByKey(key);
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
        {key: "outputFilter", regexp: /all|read/, builder: new FilterJSON(name)}
      ]
    );
  }
  deleteSchema(name) {
    if (this.schemas[name]) {
      delete this.schemas[name];
    }
  }
  getSchemaByKey(schema, key) {
    const modelName = schema.$ref.replace("#/components/schemas/", "")
    return this.schemas[modelName].getSchemaBuilderByKey(key).serialize();
  }

  parseParams(actionName, paramsDefintions) {
    if (paramsDefintions && Array.isArray(paramsDefintions)) {
      paramsDefintions.forEach((parameter) => {
        if (parameter.schema.$ref) {
          const schema = this.getSchemaByKey(parameter.schema, "inputValidation");
          const param = parseParameter({...parameter, schema})
          if (param) {
            const action = this.definition.actions[actionName];
            if (param.query) {
              this.addParam(action, "query", param.query)
            }
            if (param.params) {
              this.addParam(action, "params", param.params)
            }
          }
        }
      })
    }
  }
  addParam(action, type, schema) {
    if (action.params[type]) {
      action.params[type].props = Object.assign(action.params[type].props, schema)
    } else {
      action.params[type] = {
        type: "object",
        strict: true,
        props: {
          ...schema
        }
      }
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
