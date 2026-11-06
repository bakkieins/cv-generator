const fs = require("node:fs");
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, LevelFormat, BorderStyle, TabStopType,
} = require("docx");

const T = {
  font: "Calibri",
  accent: "1F4E79",
  muted: "555555",
  titleColor: "333333",
  name: 36,
  section: 24,
  body: 20,
  small: 18,
  pageW: 11906,
  pageH: 16838,
  margin: 720,
};

const RIGHT_TAB_POS = T.pageW - 2 * T.margin;

const locales = {
  en: {
    headerAlignment: AlignmentType.CENTER,
    // Kontaktzeile unter dem Namen, darunter der Titel. DE nennt Kontaktdaten unter „Persönliche Daten".
    contactLine: ({ location, email, linkedin }) => `${location}  ·  ${email}  ·  ${linkedin}`,
    headerSpacingAfter: { name: 60, contact: 40, title: 0 },
    sectionHeadingSpacing: { before: 180, after: 40 },
    jobHeadingSpacing: { before: 120, after: 0 },
    companySpacing: { before: 0, after: 40 },
    trailingJobParagraph: true,
    sections: {
      personal: null,
      summary: "Professional Summary",
      experience: "Professional Experience",
      projects: "Projects",
      education: "Education",
      certifications: "Certifications",
      skills: "Skills & Tools",
    },
  },
  de: {
    headerAlignment: AlignmentType.LEFT,
    contactLine: null,
    headerSpacingAfter: { name: 20, title: 60 },
    sectionHeadingSpacing: { before: 130, after: 30 },
    jobHeadingSpacing: { before: 90, after: 0 },
    companySpacing: { before: 0, after: 30 },
    trailingJobParagraph: false,
    detailsTabPosition: 2200,
    sections: {
      personal: "Persönliche Daten",
      summary: "Kurzprofil",
      experience: "Berufserfahrung",
      projects: "Projekte",
      education: "Ausbildung",
      certifications: "Zertifikate",
      skills: "Kenntnisse & Tools",
    },
  },
};

const numbering = {
  config: [{
    reference: "bullets",
    levels: [{
      level: 0,
      format: LevelFormat.BULLET,
      text: "•",
      alignment: AlignmentType.LEFT,
      style: {
        paragraph: { indent: { left: 360, hanging: 360 } },
        run: { font: "Symbol", size: T.body },
      },
    }],
  }],
};

const run = (text, opts = {}) =>
  new TextRun({ text, font: T.font, size: T.body, ...opts });

const sectionHeading = (text, locale) =>
  new Paragraph({
    children: [run(text.toUpperCase(), { bold: true, size: T.section, color: T.accent })],
    spacing: locale.sectionHeadingSpacing,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: T.accent, space: 4 } },
  });

const bullet = (text, keepNext = false) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [run(text)],
    spacing: { before: 10, after: 10 },
    ...(keepNext ? { keepNext: true } : {}),
  });

// Links Titel oder Name, rechts bündig Datum oder Aussteller. Hält immer mit dem Folgeabsatz zusammen.
const twoColRow = (leftText, leftOpts, rightText, spacing) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB_POS }],
    children: [run(leftText, leftOpts), run("\t"), run(rightText, { size: T.small, color: T.muted })],
    spacing,
    keepNext: true,
  });

// Kleine graue Zeile für Firma, Institution oder Aufstiegszeile.
const mutedLine = (text, spacing, { italics = true, keepNext = false } = {}) =>
  new Paragraph({
    children: [run(text, { size: T.small, color: T.muted, ...(italics ? { italics: true } : {}) })],
    spacing,
    ...(keepNext ? { keepNext: true } : {}),
  });

// Firmenkopf über mehreren Rollen beim selben Arbeitgeber.
const renderEmployer = (company, { dates, note }, locale) => [
  twoColRow(company, { bold: true, color: T.accent }, dates, locale.jobHeadingSpacing),
  ...(note ? [mutedLine(note, locale.companySpacing, { keepNext: true })] : []),
];

function renderJob({ title, company, dates, bullets }, locale, grouped = false) {
  if (!Array.isArray(bullets) || bullets.length === 0) {
    throw new Error(`Job "${title}" must contain at least one bullet.`);
  }

  const headingSpacing = grouped
    ? { ...locale.jobHeadingSpacing, after: locale.companySpacing.after }
    : locale.jobHeadingSpacing;
  const paragraphs = [
    twoColRow(title, { bold: true }, dates, headingSpacing),
    ...(grouped ? [] : [mutedLine(company, locale.companySpacing, { keepNext: true })]),
    // Alle Bullets außer dem letzten halten zusammen, damit eine Rolle nicht mitten im Block umbricht.
    ...bullets.map((text, index) => bullet(text, index < bullets.length - 1)),
  ];

  if (locale.trailingJobParagraph) {
    paragraphs.push(new Paragraph({ children: [run("")], spacing: { before: 0, after: 10 } }));
  }
  return paragraphs;
}

// Folgen Rollen mit gleichem `company` aufeinander und gibt es dazu einen Eintrag in `employers`,
// erscheint die Firma einmal als Kopf. Ohne `employers` bleibt alles wie bisher.
function renderExperience(experience, locale, employers = {}) {
  return experience.flatMap((job, index) => {
    const employer = employers[job.company];
    if (!employer) return renderJob(job, locale);
    const startsGroup = index === 0 || experience[index - 1].company !== job.company;
    return [...(startsGroup ? renderEmployer(job.company, employer, locale) : []), ...renderJob(job, locale, true)];
  });
}

const renderEducation = ({ degree, institution, years, notes }) => [
  twoColRow(degree, { bold: true }, years ?? "", { before: 120, after: 0 }),
  mutedLine(institution, { before: 0, after: notes ? 20 : 40 }),
  ...(notes ? [mutedLine(notes, { before: 0, after: 40 }, { italics: false })] : []),
];

const renderCertification = ({ name, issuer }) =>
  twoColRow(name, {}, issuer, { before: 40, after: 40 });

const renderSkillRow = ({ label, items }) =>
  new Paragraph({
    children: [run(`${label}: `, { bold: true }), run(items.join(" · "))],
    spacing: { before: 60, after: 40 },
  });

function renderHeader(personal, locale) {
  const line = (children, after) =>
    new Paragraph({ alignment: locale.headerAlignment, children, spacing: { before: 0, after } });
  const spacing = locale.headerSpacingAfter;
  return [
    line([run(personal.name, { bold: true, size: T.name, color: T.accent })], spacing.name),
    ...(locale.contactLine
      ? [line([run(locale.contactLine(personal), { size: T.small, color: T.muted })], spacing.contact)]
      : []),
    line([run(personal.title, { size: T.small, italics: true, color: T.titleColor })], spacing.title),
  ];
}

function renderPersonalDetails(personal, locale) {
  if (!Array.isArray(personal.details)) {
    throw new Error('German CV data must provide "personal.details".');
  }
  return [
    sectionHeading(locale.sections.personal, locale),
    ...personal.details.map(([label, value]) => new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: locale.detailsTabPosition }],
      children: [run(`${label}:`, { bold: true }), run("\t"), run(value)],
      spacing: { before: 20, after: 20 },
    })),
  ];
}

function buildDocument(data, localeName = "en") {
  const locale = locales[localeName];
  if (!locale) {
    throw new Error(`Unsupported renderer locale "${localeName}".`);
  }

  const { personal, summary, experience, employers, projects, education, certifications, skills } = data;
  const children = [
    ...renderHeader(personal, locale),
    ...(locale.sections.personal ? renderPersonalDetails(personal, locale) : []),
    sectionHeading(locale.sections.summary, locale),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      children: [run(summary)],
      spacing: { before: 80, after: 0 },
    }),
    sectionHeading(locale.sections.experience, locale),
    ...renderExperience(experience, locale, employers),
    // Projekte wie Rollen: Name, Datum, graue Zeile (z. B. Link), Bullets. Leer = Sektion entfällt.
    ...(projects?.length
      ? [
        sectionHeading(locale.sections.projects, locale),
        ...projects.flatMap(({ name, note, dates, bullets }) => renderJob({ title: name, company: note, dates, bullets }, locale)),
      ]
      : []),
    sectionHeading(locale.sections.education, locale),
    ...education.flatMap(renderEducation),
    ...(certifications?.length
      ? [sectionHeading(locale.sections.certifications, locale), ...certifications.map(renderCertification)]
      : []),
    sectionHeading(locale.sections.skills, locale),
    ...skills.map(renderSkillRow),
  ];

  return new Document({
    numbering,
    styles: { default: { document: { run: { font: T.font, size: T.body } } } },
    sections: [{
      properties: {
        page: {
          size: { width: T.pageW, height: T.pageH },
          margin: { top: T.margin, right: T.margin, bottom: T.margin, left: T.margin },
        },
      },
      children,
    }],
  });
}

async function generate(data, outputPath, locale = "en") {
  const buffer = await Packer.toBuffer(buildDocument(data, locale));
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅  Written → ${outputPath}`);
}

module.exports = { generate, buildDocument };
