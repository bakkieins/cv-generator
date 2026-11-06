const TIMEOUT_MS = 60_000;

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  return response.text();
}

function htmlToText(html = "") {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function greenhouse({ slug, company }) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return data.jobs.map((job) => ({
    id: String(job.id),
    company: company ?? job.company_name,
    title: job.title,
    location: job.location?.name ?? "",
    url: job.absolute_url,
    postedAt: job.first_published ?? job.updated_at,
    description: htmlToText(job.content),
  }));
}

async function ashby({ slug, company }) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return data.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => ({
      id: job.id,
      company,
      title: job.title,
      // isRemote ist bei Ashby auch für Hybrid-Stellen gesetzt, daher nur workplaceType verwenden.
      location: [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location), job.workplaceType]
        .filter(Boolean)
        .join(" · "),
      url: job.jobUrl,
      postedAt: job.publishedAt,
      salary: job.compensation?.compensationTierSummary ?? "",
      description: job.descriptionPlain ?? htmlToText(job.descriptionHtml),
    }));
}

async function lever({ slug, company }) {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return data.map((job) => ({
    id: job.id,
    company,
    title: job.text,
    location: [job.categories?.location, ...(job.categories?.allLocations ?? []), job.workplaceType].filter(Boolean).join(" · "),
    url: job.hostedUrl,
    postedAt: new Date(job.createdAt).toISOString(),
    salary: job.salaryRange ? `${job.salaryRange.currency} ${job.salaryRange.min}–${job.salaryRange.max}` : "",
    description: [
      job.descriptionPlain,
      ...(job.lists ?? []).map((list) => `${list.text}\n${htmlToText(list.content)}`),
      job.additionalPlain,
    ].filter(Boolean).join("\n\n"),
  }));
}

async function smartrecruiters({ slug, company }) {
  const postings = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`);
    postings.push(...page.content);
    if (postings.length >= page.totalFound || page.content.length === 0) break;
  }
  return postings.map((job) => ({
    id: job.id,
    company: company ?? job.company?.name,
    title: job.name,
    location: [job.location?.city, job.location?.country?.toUpperCase(), job.location?.remote ? "Remote" : ""].filter(Boolean).join(" · "),
    url: `https://jobs.smartrecruiters.com/${slug}/${job.id}`,
    postedAt: job.releasedDate,
    description: "",
    detailUrl: job.ref,
  }));
}

async function smartrecruitersDetail(job) {
  const detail = await getJson(job.detailUrl);
  const sections = detail.jobAd?.sections ?? {};
  return Object.values(sections)
    .map((section) => `${section.title ?? ""}\n${htmlToText(section.text)}`)
    .join("\n\n");
}

async function personio({ slug, company }) {
  const xml = await getText(`https://${slug}.jobs.personio.de/xml`);
  const field = (block, name) => block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "";
  const cdata = (value) => value.replace(/^<!\[CDATA\[|\]\]>$/g, "");
  return [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, block]) => {
    const id = field(block, "id");
    const descriptions = [...block.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)]
      .map(([, part]) => `${field(part, "name")}\n${htmlToText(cdata(field(part, "value")))}`);
    return {
      id,
      company: company ?? field(block, "subcompany"),
      title: field(block, "name"),
      location: field(block, "office"),
      url: `https://${slug}.jobs.personio.de/job/${id}`,
      postedAt: field(block, "createdAt"),
      description: descriptions.join("\n\n"),
    };
  });
}

// Öffentliche Jobsuche-API der Bundesagentur für Arbeit, liefert keine Beschreibung.
async function arbeitsagentur({ query, location, radiusKm = 50, publishedWithinDays = 7 }) {
  const params = new URLSearchParams({
    was: query,
    wo: location,
    umkreis: String(radiusKm),
    veroeffentlichtseit: String(publishedWithinDays),
    angebotsart: "1",
    size: "100",
  });
  const data = await getJson(
    `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs?${params}`,
    { "X-API-Key": "jobboerse-jobsuche" },
  );
  return (data.ergebnisliste ?? []).map((job) => ({
    id: job.refnr ?? job.referenznummer,
    company: job.firma,
    title: job.stellenangebotsTitel ?? job.titel ?? job.beruf,
    location: [
      ...(job.stellenlokationen ?? []).map((l) => l.adresse?.ort),
      job.arbeitsort?.ort,
      job.homeofficemoeglich ? "Homeoffice möglich" : "",
      // Nur Ortsnamen wie „Ratingen" würden sonst am Ortsfilter scheitern.
      "Deutschland",
    ].filter(Boolean).join(" · "),
    url: job.externeURL ?? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${job.refnr ?? job.referenznummer}`,
    postedAt: job.datumErsteVeroeffentlichung ?? job.aktuelleVeroeffentlichungsdatum,
    description: "",
  }));
}

// Arbeitnow mischt Stellen seiner Länderseiten bei, oft ohne Ort. Dann verrät nur die Domain das Land.
const ARBEITNOW_COUNTRY = { "www.arbeitnow.co.uk": "United Kingdom", "www.arbeitnow.fr": "France" };

// Öffentliche API von arbeitnow.com (vor allem DE), 300 Stellen pro Seite, neueste zuerst.
// Nur so viele Seiten laden, wie der Zeitraum braucht: Die API bittet ausdrücklich darum, sie nicht zu überlasten.
async function arbeitnow({ publishedWithinDays = 14, maxPages = 10 }) {
  const cutoff = Date.now() / 1000 - publishedWithinDays * 24 * 60 * 60;
  const jobs = [];
  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    jobs.push(...data.data);
    if (!data.links?.next || data.data.length === 0 || data.data.at(-1).created_at < cutoff) break;
  }
  return jobs
    .filter((job) => job.created_at >= cutoff)
    .map((job) => ({
      id: job.slug,
      company: job.company_name,
      title: job.title,
      location: [job.location || ARBEITNOW_COUNTRY[new URL(job.url).hostname], job.remote ? "Remote" : ""].filter(Boolean).join(" · "),
      url: job.url,
      postedAt: new Date(job.created_at * 1000).toISOString(),
      description: htmlToText(job.description),
    }));
}

const fetchers = { greenhouse, ashby, lever, smartrecruiters, personio, arbeitsagentur, arbeitnow };

async function fetchSource(source) {
  const fetcher = fetchers[source.ats];
  if (!fetcher) {
    throw new Error(`Unknown source type "${source.ats}"`);
  }
  const jobs = await fetcher(source);
  // Jobbörsen ohne Firmen-Slug (Bundesagentur, Arbeitnow) teilen sich einen Schlüssel über alle Suchen.
  const sourceKey = source.slug ? `${source.ats}:${source.slug}` : source.ats;
  return jobs.map((job) => ({ ...job, source: sourceKey, key: `${sourceKey}:${job.id}` }));
}

async function loadDescription(job) {
  if (job.description || !job.detailUrl) return job;
  return { ...job, description: await smartrecruitersDetail(job) };
}

module.exports = { fetchSource, loadDescription };
