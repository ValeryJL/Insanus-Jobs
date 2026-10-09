import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export function loadProfile() {
  const profilePath = path.resolve('config/profile.yml');
  const examplePath = path.resolve('config/profile.example.yml');

  let config = {};
  if (fs.existsSync(profilePath)) {
    try {
      config = yaml.load(fs.readFileSync(profilePath, 'utf8')) || {};
    } catch (e) {
      console.warn('Could not parse config/profile.yml, using example fallback.');
    }
  } else if (fs.existsSync(examplePath)) {
    try {
      config = yaml.load(fs.readFileSync(examplePath, 'utf8')) || {};
    } catch (e) {}
  }

  const c = config.candidate || {};
  return {
    fullName: c.full_name || 'Candidate Name',
    firstName: (c.full_name || 'Candidate').split(' ')[0],
    email: c.email || 'candidate@example.com',
    phone: c.phone || '+1-555-0123',
    location: c.location || 'Remote',
    linkedin: c.linkedin || 'https://linkedin.com',
    github: c.github || 'https://github.com',
    portfolio: c.portfolio_url || '',
    expectedGraduation: c.expected_graduation || '2028',
    headline: config.narrative?.headline || 'Software Engineer'
  };
}
