const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dm55bHVxb21tdXNwcGJ6eWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTEyMTQsImV4cCI6MjA5ODA2NzIxNH0.fBJiVjLzRlIom2uwTmjwJrmHt6DP2xi98H2LhiDdVx0';
const url = 'https://tzvnyluqommusppbzyiy.supabase.co/rest/v1/system_config?select=key,value';

async function run() {
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) {
    console.error('Fetch failed:', res.status, await res.text());
    return;
  }
  const data = await res.json();
  console.log('system_config:', data);
}

run().catch(console.error);
