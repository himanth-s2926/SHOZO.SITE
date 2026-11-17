'use strict';
// Seed data is taken from the content of the six HTML pages.
// Safe to re-run: a table is only filled if it is empty.
const U = (id, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const IMG = {
  kitchen: '1764526624453-db32c24eca55',
  living: '1768609239321-1cfe14893e80',
  bedroom: '1757344454333-cc666252e596',
  hospitality: '1758448500688-3ababa93fd67',
};

const projects = [
  ['ashgrove-residence', 'Ashgrove Residence', 'kitchen', 2025, IMG.kitchen, 'Ashgrove Residence kitchen with walnut cabinetry', 1],
  ['kanzo-loft', 'Kanzo Loft', 'living', 2025, IMG.living, 'Kanzo Loft living room', 1],
  ['willow-studio', 'Willow Studio', 'bedroom', 2024, IMG.bedroom, 'Willow Studio bedroom', 1],
  ['ember-inn', 'Ember Inn', 'hospitality', 2024, IMG.hospitality, 'Ember Inn lobby', 0],
  ['northfield-studio', 'Northfield Studio', 'office', 2024, IMG.hospitality, 'Northfield Studio office', 0],
  ['riverstone-house', 'Riverstone House', 'living', 2023, IMG.living, 'Riverstone living room', 0],
  ['marlow-residence', 'Marlow Residence', 'kitchen', 2023, IMG.kitchen, 'Marlow kitchen', 0],
  ['hollow-pine', 'Hollow Pine', 'bedroom', 2023, IMG.bedroom, 'Hollow Pine bedroom', 0],
  ['cedar-and-salt', 'Cedar & Salt', 'hospitality', 2023, IMG.hospitality, 'Cedar & Salt restaurant interior', 0],
];

// Only the featured post's excerpt exists on the page; the others have a title, month and tag.
// Day-of-month is not shown on the site, so the 1st is used as a placeholder.
const posts = [
  ['japanese-joinery-and-restraint', 'Notes on Japanese joinery, and what it teaches about restraint', 'Featured',
    'A joint that needs a screw to hide its mistake was never finished. What six years of studying traditional woodwork taught our founder about knowing when a room is actually done.',
    U(IMG.kitchen, 1400), 'Close-up of walnut wood grain and joinery detail', 1, '2026-03-01'],
  ['materials-before-furniture', 'Why we choose materials before furniture', 'Process', null, null, null, 0, '2026-02-01'],
  ['case-for-a-slower-renovation', 'The case for a slower renovation timeline', 'Renovation', null, null, null, 0, '2026-01-01'],
  ['reading-a-rooms-light', "Reading a room's light before you design it", 'Method', null, null, null, 0, '2025-12-01'],
  ['reclaimed-wood-suppliers', 'What we look for in a reclaimed wood supplier', 'Material', null, null, null, 0, '2025-11-01'],
  ['small-rooms-less-furniture', 'Small rooms, and the case against more furniture', 'Living', null, null, null, 0, '2025-10-01'],
];

const services = [
  ['A', 'Full Interior Design', 'Concept to final install — space planning, material palette, custom joinery, furniture, and styling, managed start to finish.', 850000],
  ['B', 'Space Planning & Consultation', 'A single working session — layout, light study, and a material direction you can take to any contractor.', 35000],
  ['C', 'Material & Furniture Sourcing', 'For owners managing their own build who want our sourcing network and eye, without the full design engagement.', 120000],
  ['D', 'Renovation Direction', "Weekly on-site visits through an active renovation, keeping the contractor's work aligned to the original intent.", 240000],
  ['E', 'Styling & Staging', 'The final layer — soft furnishing, art, and objects placed for move-in day, a shoot, or a listing.', 60000],
];

const steps = [
  [1, 'Walkthrough & Brief', 'We visit the space, note the light, and talk through how you actually want to live in it.'],
  [2, 'Concept & Palette', 'A material and layout direction, presented as physical samples, not just renders.'],
  [3, 'Drawings & Sourcing', 'Detailed drawings, joinery specs, and sourcing across our maker and supplier network.'],
  [4, 'Build & Install', 'On-site direction through construction, so nothing drifts from the original brief.'],
  [5, 'Final Styling', 'The last layer placed by hand — the difference between finished and lived-in.'],
];

const team = [
  ['Aiko Mori', 'Founder & Lead Designer', 'https://images.unsplash.com/photo-1569925444984-9e2e5fc3d1fb?auto=format&fit=crop&w=500&q=80', 'Portrait of Aiko Mori'],
  ['Devan Rao', 'Materials Lead', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80', 'Portrait of Devan Rao'],
  ['Priya Nair', 'Senior Designer', 'https://images.unsplash.com/photo-1758876019338-c190822f6ca0?auto=format&fit=crop&w=500&q=80', 'Portrait of Priya Nair'],
  ['Kenji Sato', 'Master Joiner', 'https://images.unsplash.com/photo-1676732619792-7d468a350aa7?auto=format&fit=crop&w=500&q=80', 'Portrait of Kenji Sato'],
];

const isEmpty = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n === 0;

function seed(db) {
  const done = [];
  db.transaction(() => {
    if (isEmpty(db, 'projects')) {
      const ins = db.prepare(`INSERT INTO projects (slug,title,category,year,image_url,image_alt,featured,sort_order)
                              VALUES (?,?,?,?,?,?,?,?)`);
      projects.forEach(([slug, title, cat, year, img, alt, featured], i) =>
        ins.run(slug, title, cat, year, U(img), alt, featured, i));
      done.push('projects');
    }
    if (isEmpty(db, 'posts')) {
      const ins = db.prepare(`INSERT INTO posts (slug,title,category,excerpt,image_url,image_alt,featured,published_at)
                              VALUES (?,?,?,?,?,?,?,?)`);
      posts.forEach(([slug, title, cat, excerpt, img, alt, featured, date]) =>
        ins.run(slug, title, cat, excerpt, img, alt, featured, date));
      done.push('posts');
    }
    if (isEmpty(db, 'services')) {
      const ins = db.prepare('INSERT INTO services (code,title,description,price_from,sort_order) VALUES (?,?,?,?,?)');
      services.forEach(([code, title, desc, price], i) => ins.run(code, title, desc, price, i));
      done.push('services');
    }
    if (isEmpty(db, 'process_steps')) {
      const ins = db.prepare('INSERT INTO process_steps (step_no,title,description) VALUES (?,?,?)');
      steps.forEach((s) => ins.run(...s));
      done.push('process_steps');
    }
    if (isEmpty(db, 'team_members')) {
      const ins = db.prepare('INSERT INTO team_members (name,role,image_url,image_alt,sort_order) VALUES (?,?,?,?,?)');
      team.forEach(([name, role, img, alt], i) => ins.run(name, role, img, alt, i));
      done.push('team_members');
    }
  })();
  return done;
}

module.exports = { seed };

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const { loadConfig } = require('./config');
  const { openDb } = require('./db');
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const done = seed(db);
  console.log(done.length ? `Seeded: ${done.join(', ')}` : 'Nothing to seed (tables already have data).');
  db.close();
}
