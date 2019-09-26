class GQLSchema {
  constructor(name, type="Type") {
    this.gqlType = type;
    this.innerSchema = [];
    this.name = name;
    this.currentPath = this.innerSchema;

    this.innerRefs = {}
  }
  addProperty(schema, path) {
    const destPath = path.replace(`.${schema.key}`, '');
    if (this.innerRefs[destPath]) {
      const data = this.parse(Object.assign({}, schema, {key:null}), path);
      const index = this.innerRefs[destPath];
      this.innerSchema[index] = this.innerSchema[index].replace(`%${destPath}%`, data)
      delete this.innerRefs[path];
    }
    else {
      const data = this.parse(schema, path);
      if (data) {
        this.innerSchema.push(data);
        if (this.innerRefs[path]) {
          this.innerRefs[path] = this.innerSchema.length -1;
        }
      }
    }
    return;
  }
  setRefProperty(ref, path) {
    const destPath = path.replace(`.${ref.key}`, '');
    if (destPath in this.innerRefs) {
      const index = this.innerRefs[destPath];
      this.innerSchema[index] = this.innerSchema[index].replace(`%${destPath}%`, ref.type);
      delete this.innerRefs[destPath];
    }
  }
  getSchemaByPath(path) {
    const out = path
    .replace(/properties/g, "props")
    .split(".")
    .reduce((object, item)=>{
      if (object[item]) {
        return object[item];
      }
      return 0;
    }
    , 0);
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
    return {type: this.name};
  }
  getSchema() {
    return {};
  }
  serialize() {
    return `${this.gqlType} ${this.name}{\r\n  ${this.innerSchema.join("\r\n  ")}\r\n}\r\n`;
  }

  parse({type, key, required, ...args}, path) {
    const isRequired = (required)?'!': '';
    switch(type){
      case "object":
        return;
      case "string":
        const {pattern} = args;
        return `${(key)?`${key}: `:""}String${isRequired}`;
      case "integer":
        return `${(key)?`${key}: `:""}: Integer${isRequired}`;
      case "array":
        this.innerRefs[path] = "toSet";
        return `${(key)?`${key}: `:""}[%${path}%]${isRequired}`
      return;
    }
    return ;
  }
}
module.exports = GQLSchema;
