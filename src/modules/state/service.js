const queries = require('./queries');

async function get_summary(sourceId = null) {
  return await queries.getSummary(sourceId);
}

async function get_pending(sourceId = null) {
  return await queries.getPending(sourceId);
}

async function get_exceptions(sourceId = null) {
  return await queries.getExceptions(sourceId);
}

module.exports = {
  get_summary,
  get_pending,
  get_exceptions
};
