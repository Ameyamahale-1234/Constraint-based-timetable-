const { normalizeData } = require('./dataNormalizer');
const TABLES = {
  department: 'Department', faculty: 'Faculty', courses: 'Course', divisions: 'Division', rooms: 'Room',
  courseFaculty: 'Course_Faculty', courseDivision: 'Course_Division'
};
async function loadSupabaseData(client, tableOverrides = {}) {
  if (!client || typeof client.from !== 'function') throw new TypeError('A configured Supabase client is required');
  const raw = {};
  for (const [key, defaultTable] of Object.entries(TABLES)) {
    const table = tableOverrides[key] || defaultTable;
    const { data, error } = await client.from(table).select('*');
    if (error) throw new Error(`Failed to load ${table}: ${error.message || error}`);
    raw[key] = data || [];
  }
  return normalizeData(raw);
}
module.exports = { loadSupabaseData, TABLES };
