class JSONSchema {
  constructor(name) {
    this.innerSchema = {};
    this.name = name;
    this.currentPath = this.innerSchema;
  }
  addProperty(schema, path) {
    const data = this.parse(schema);
    const destPath = (schema.key)?path.replace(`.${schema.key}`, ''):path;
    const curPath = this.getSchemaByPath(destPath);
    if (schema.key) {
      curPath[schema.key] = data;
    } else {
      curPath = data;
    }
  }
  setRefProperty(ref, path) {
    const destPath = (ref.key)?path.replace(`.${ref.key}`, ''):path;
    const curPath = this.getSchemaByPath(destPath);
    if (ref.key) {
      curPath[ref.key] = ref;
    } else {
      curPath = ref;
    }
  }
  getSchemaByPath(path) {
    const out = path
    // .replace(/properties/g, "props")
    .split(".")
    .reduce((object, item)=>{
      if (object[item]) {
        return object[item];
      }
      return object;
    }
    , this.innerSchema);
    return out;
  }
  setSchemaByPath(key, schemaObject) {
    key.split(".")
    .reduce((object, item, i, tab)=>{
      if (i+1 === tab.length) {
        object[item] = schemaObject;
      }
      if (object[item]) {
        return object[item];
      }
    }
    , this.innerSchema)
  }
  getRef() {
    return this.innerSchema[this.name];
  }
  serialize() {
    return this.innerSchema[this.name];
  }

  parse({type, ...schema}) {
    switch(type){
      case "object":
        return { type: "object", properties: {}, };
      case "string":
        const {pattern} = schema;
        const output = { type: "string", }
        if (pattern) {
          output.pattern = pattern;
        }
        return output;
      case "integer":
        return { type: "integer", };
      case "array":
        return {
          type: "array",
          items: {},
        }
      return;
    }
    return ;
  }
}
module.exports = JSONSchema;
