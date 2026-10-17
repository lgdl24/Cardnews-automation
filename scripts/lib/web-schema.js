// 웹 데이터 스키마 검사 (schemas/web-data/) — export와 테스트가 함께 씀
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { ROOT } = require('./common');

const readSchema = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', rel), 'utf8'));
const schemaUrl = (name) => `https://github.com/lgdl24/Cardnews-automation/schemas/web-data/${name}.schema.json`;

let ajv = null;
function getAjv() {
  if (ajv) return ajv;
  // strictTypes: cards.schema.json의 if/then 안 축약형을 경고 없이 읽음 (검사 결과는 같음)
  ajv = new Ajv2020({ allErrors: true, strictTypes: false });
  ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  ajv.addSchema(readSchema('cards.schema.json'));
  for (const name of ['index', 'project', 'timeline']) ajv.addSchema(readSchema(`web-data/${name}.schema.json`));
  return ajv;
}

// 반환: 오류 목록 (통과하면 빈 배열)
function checkWebData(name, data) {
  const validate = getAjv().getSchema(schemaUrl(name));
  if (validate(data)) return [];
  return validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
}

module.exports = { checkWebData, schemaUrl, getAjv };
