const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testInsert() {
  const { data, error } = await supabase
    .from('openings')
    .insert([{ username: 'testuser', openings: { 'test': 1 }, count: 1 }]);
  console.log('Insert test data:', data);
  console.log('Insert test error:', error);
}

testInsert();
