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

async function delete_duplicates(sourceId = null) {
  return await queries.deleteDuplicates(sourceId);
}

async function get_processed(sourceId = null) {
  return await queries.getProcessed(sourceId);
}

async function delete_exceptions(sourceId = null) {
  return await queries.deleteExceptions(sourceId);
}

module.exports = {
  get_summary,
  get_pending,
  get_exceptions,
  delete_duplicates,
  get_processed,
  delete_exceptions
};
