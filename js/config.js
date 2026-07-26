// config.js — the only file you edit by hand to go live.
//
// Leave these empty and the whole site runs on localStorage, so every screen
// works before a database exists. Fill them in and db.js switches to Supabase
// with no other change anywhere in the project.
//
// Project settings → API in the Supabase dashboard.
// Use the anon / publishable key. NEVER the service role key: everything in
// this folder is downloaded by the browser and readable by anyone.

// The project root, with no path on the end. The client appends /rest/v1 and
// /auth/v1 itself — copying the REST endpoint from the dashboard instead sends
// every request to /rest/v1/rest/v1/… and every sign-in to a 404.
export const SUPABASE_URL = 'https://sramwiiwokhollrunbbi.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYW13aWl3b2tob2xscnVuYmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMzEzNzYsImV4cCI6MjEwMDYwNzM3Nn0.YlijBof_VGwprvUkse6IRBUbLb-7HTL_Fg4PsCB26Js';
