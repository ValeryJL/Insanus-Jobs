#!/usr/bin/env node
/**
 * scripts/linkedin_search.mjs — Search LinkedIn Jobs via Public Guest API (Zero Cookies Needed)
 *
 * Usage:
 *   node scripts/linkedin_search.mjs --keywords "Junior Backend" --location "Argentina" --limit 5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : def;
}

const keywords = getArg('--keywords', 'Junior Backend Developer');
const location = getArg('--location', 'Argentina');
const limit = parseInt(getArg('--limit', '5'), 10);
const remote = args.includes('--remote');

async function fetchJobDescription(jobId) {
  if (!jobId) return '';
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return '';
    const html = await res.text();
    const descMatch = html.match(/<div class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!descMatch) return '';
    return descMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (_) {
    return '';
  }
}

async function searchJobs() {
  const params = new URLSearchParams({
    keywords: keywords,
    location: location,
    f_AL: 'true', // Easy Apply
    sortBy: 'DD',
    start: '0'
  });
  if (remote) {
    params.set('f_WT', '2'); // Remote
  }

  const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    if (!res.ok) {
      throw new Error(`LinkedIn Guest Jobs API returned HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const cards = html.split('<li').slice(1);
    const jobs = [];

    for (const card of cards) {
      if (jobs.length >= limit) break;

      const titleMatch = card.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
      const companyMatch = card.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
      const locationMatch = card.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const linkMatch = card.match(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/);
      const idMatch = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/);

      if (titleMatch && linkMatch) {
        const jobId = idMatch ? idMatch[1] : (linkMatch[1].match(/\/(\d{8,})/i) || [])[1] || '';
        const href = linkMatch[1].split('?')[0];
        const title = titleMatch[1].trim().replace(/\s+/g, ' ');
        const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const loc = locationMatch ? locationMatch[1].trim() : '';

        // Deduplication
        if (!jobs.some(j => j.url === href || (jobId && j.job_id === jobId))) {
          jobs.push({
            job_id: jobId,
            title: title,
            company: company,
            location: loc,
            url: href,
            easy_apply: true
          });
        }
      }
    }

    // Optionally enrich top matches with full description
    for (const job of jobs) {
      if (job.job_id) {
        job.description = await fetchJobDescription(job.job_id);
      }
    }

    console.log(JSON.stringify({ query: { keywords, location, limit }, count: jobs.length, jobs }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

searchJobs();
