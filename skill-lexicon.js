// skill-lexicon.js
// Skill vocabulary built from public occupational data (O*NET) plus a small
// curated alias map. Pure logic: no chrome.* APIs, no network here — the caller
// fetches the CSV text and passes it in.

const LEXICON_SCHEMA_VERSION = 1;
const ONET_PINNED_RELEASE = 'db_31_0';
const ONET_ORIGIN = 'https://www.onetcenter.org';
const ONET_SOFTWARE_CSV = `${ONET_ORIGIN}/dl_files/database/${ONET_PINNED_RELEASE}_csv/software_skills.csv`;
const ONET_ESSENTIAL_CSV = `${ONET_ORIGIN}/dl_files/database/${ONET_PINNED_RELEASE}_csv/essential_skills.csv`;
const ONET_TRANSFERABLE_CSV = `${ONET_ORIGIN}/dl_files/database/${ONET_PINNED_RELEASE}_csv/transferable_skills.csv`;
const ONET_LICENSE = 'O*NET 31.0 database, CC BY 4.0, U.S. Department of Labor';

function parseOnetRelease(html) {
    const match = String(html || '').match(/\/dl_files\/database\/db_(\d+)_(\d+)_csv\//);
    return match ? `db_${match[1]}_${match[2]}` : '';
}

function buildOnetUrls(release = ONET_PINNED_RELEASE) {
    const base = `${ONET_ORIGIN}/dl_files/database/${release}_csv`;
    return {
        release,
        software: `${base}/software_skills.csv`,
        essential: `${base}/essential_skills.csv`,
        transferable: `${base}/transferable_skills.csv`,
    };
}

const CURATED_ALIASES = {
    'js': 'JavaScript',
    'javascript': 'JavaScript',
    'ts': 'TypeScript',
    'typescript': 'TypeScript',
    'node.js': 'Node.js',
    'nodejs': 'Node.js',
    'node': 'Node.js',
    'react.js': 'React',
    'reactjs': 'React',
    'next.js': 'Next.js',
    'nextjs': 'Next.js',
    'vue.js': 'Vue.js',
    'vuejs': 'Vue.js',
    'angular.js': 'Angular',
    'angularjs': 'Angular',
    'k8s': 'Kubernetes',
    'postgres': 'PostgreSQL',
    'postgresql': 'PostgreSQL',
    'mongo': 'MongoDB',
    'mongodb': 'MongoDB',
    'gcp': 'Google Cloud Platform',
    'aws': 'Amazon Web Services',
    'azure': 'Microsoft Azure',
    'ci/cd': 'CI/CD',
    'cicd': 'CI/CD',
    'ml': 'Machine Learning',
    'ai': 'Artificial Intelligence',
    'llm': 'Large Language Models',
    'llms': 'Large Language Models',
    'nlp': 'Natural Language Processing',
    'sql': 'SQL',
    'nosql': 'NoSQL',
    'html5': 'HTML',
    'css3': 'CSS',
    'rest api': 'REST APIs',
    'rest apis': 'REST APIs',
    'graphql': 'GraphQL',
    'sass': 'Sass',
    'scss': 'Sass',
    'tailwind': 'Tailwind CSS',
    'tailwindcss': 'Tailwind CSS',
    'powerbi': 'Power BI',
    'power bi': 'Power BI',
    'tableau': 'Tableau',
    'excel': 'Microsoft Excel',
    'ms excel': 'Microsoft Excel',
    'salesforce': 'Salesforce',
    'sap': 'SAP',
    'quickbooks': 'QuickBooks',
    'adobe photoshop': 'Adobe Photoshop',
    'photoshop': 'Adobe Photoshop',
    'illustrator': 'Adobe Illustrator',
    'figma': 'Figma',
    'sketch': 'Sketch',
    'jira': 'Jira',
    'confluence': 'Confluence',
    'git': 'Git',
    'github': 'GitHub',
    'gitlab': 'GitLab',
    'docker': 'Docker',
    'terraform': 'Terraform',
    'ansible': 'Ansible',
    'jenkins': 'Jenkins',
    'linux': 'Linux',
    'unix': 'Unix',
    'windows server': 'Windows Server',
    'seo': 'Search Engine Optimization',
    'sem': 'Search Engine Marketing',
    'crm': 'Customer Relationship Management',
    'erp': 'Enterprise Resource Planning',
    'gaap': 'GAAP',
    'ifrs': 'IFRS',
    'hipaa': 'HIPAA',
    'gdpr': 'GDPR',
    'sox': 'Sarbanes-Oxley',
    'six sigma': 'Six Sigma',
    'lean': 'Lean Manufacturing',
    'pmp': 'Project Management Professional',
    'scrum': 'Scrum',
    'kanban': 'Kanban',
    'agile': 'Agile',
    'figma design': 'Figma',
};

const CURATED_EXTRA_TERMS = [
    'TypeScript', 'Kubernetes', 'Terraform', 'GraphQL', 'Next.js', 'Tailwind CSS', 'Figma', 'Notion',
    'Snowflake', 'Databricks', 'dbt', 'Airflow', 'Looker', 'Power BI', 'Tableau', 'Segment', 'Amplitude',
    'HubSpot', 'Marketo', 'Zendesk', 'Intercom', 'Stripe', 'Twilio', 'Segment', 'Webflow', 'Contentful',
    'Framer', 'Miro', 'Asana', 'Monday.com', 'ClickUp', 'Airtable', 'Zapier', 'Ramp', 'Brex', 'NetSuite',
    'Workday', 'Greenhouse', 'Lever', 'Okta', 'Datadog', 'Sentry', 'PagerDuty', 'Grafana', 'Prometheus',
    'LangChain', 'PyTorch', 'TensorFlow', 'scikit-learn', 'Pandas', 'NumPy', 'Spark', 'Kafka', 'Redis',
    'Elasticsearch', 'Supabase', 'Firebase', 'Vercel', 'Cloudflare', 'FastAPI', 'Django', 'Flask',
    'Spring Boot', 'Ruby on Rails', 'Laravel', 'Go', 'Rust', 'Kotlin', 'Swift', 'Scala', 'MATLAB', 'R',
];

function normalizeSkillKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9+#./ -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index++;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else if (char !== '\r') {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function rowsToObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0].map((column) => column.trim());
    return rows.slice(1)
        .filter((row) => row.some((cell) => cell && cell.trim()))
        .map((row) => {
            const object = {};
            header.forEach((column, index) => {
                object[column] = (row[index] || '').trim();
            });
            return object;
        });
}

function categoryOf(elementName) {
    const name = String(elementName || '').toLowerCase();
    if (/software|programming|development|database|operating system|network|web|application/.test(name)) return 'technical';
    if (/management|communication|leadership|negotiation|writing|speaking|training|teaching/.test(name)) return 'people';
    if (/finance|accounting|audit|budget|math|statistic|analysis|research/.test(name)) return 'analytical';
    if (/design|media|art|graphic|music|video/.test(name)) return 'creative';
    if (/sales|marketing|customer|service|administrative|clerical|production|manufacturing|health/.test(name)) return 'operational';
    return 'general';
}

function addTerm(map, name, options = {}) {
    const key = normalizeSkillKey(name);
    if (!key || key.length < 2 || key.length > 60) return;
    const existing = map.get(key);
    if (existing) {
        existing.hot = existing.hot || !!options.hot;
        existing.inDemand = existing.inDemand || !!options.inDemand;
        if (options.category && existing.category === 'general') existing.category = options.category;
        return;
    }
    map.set(key, {
        name: String(name).trim(),
        category: options.category || 'general',
        hot: !!options.hot,
        inDemand: !!options.inDemand,
        aliases: [],
    });
}

function applyCuratedAliases(map) {
    for (const [alias, canonical] of Object.entries(CURATED_ALIASES)) {
        const canonicalKey = normalizeSkillKey(canonical);
        const aliasKey = normalizeSkillKey(alias);
        if (!canonicalKey || !aliasKey) continue;
        let term = map.get(canonicalKey);
        if (!term) {
            term = {
                name: canonical,
                category: categoryOf(canonical),
                hot: false,
                inDemand: false,
                aliases: [],
            };
            map.set(canonicalKey, term);
        }
        if (aliasKey !== canonicalKey && !term.aliases.some((value) => normalizeSkillKey(value) === aliasKey)) {
            term.aliases.push(alias);
        }
    }
}

function termsFromMap(map) {
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function parseOnetSoftwareSkillsCsv(csvText) {
    const rows = rowsToObjects(parseCsv(String(csvText || '')));
    const map = new Map();
    for (const row of rows) {
        const name = row['Workplace Example'];
        if (!name) continue;
        addTerm(map, name, {
            category: categoryOf(row['Element Name']),
            hot: row['Hot Technology'] === 'Y',
            inDemand: row['In Demand'] === 'Y',
        });
    }
    return termsFromMap(map);
}

function parseOnetSkillNamesCsv(csvText) {
    const rows = rowsToObjects(parseCsv(String(csvText || '')));
    const map = new Map();
    for (const row of rows) {
        const name = row['Element Name'];
        if (!name) continue;
        addTerm(map, name, { category: categoryOf(name) });
    }
    return termsFromMap(map);
}

function buildLexiconFromOnet({ softwareCsv = '', essentialCsv = '', transferableCsv = '', version = ONET_PINNED_RELEASE } = {}) {    const map = new Map();
    for (const list of [
        parseOnetSoftwareSkillsCsv(softwareCsv),
        parseOnetSkillNamesCsv(essentialCsv),
        parseOnetSkillNamesCsv(transferableCsv),
    ]) {
        for (const term of list) {
            addTerm(map, term.name, { category: term.category, hot: term.hot, inDemand: term.inDemand });
        }
    }
    for (const term of CURATED_EXTRA_TERMS) addTerm(map, term, { category: 'technical' });
    applyCuratedAliases(map);

    const terms = termsFromMap(map).map((term) => ({
        name: term.name,
        category: term.category,
        hot: term.hot,
        inDemand: term.inDemand,
        aliases: term.aliases,
    }));

    const releaseLabel = /^db_(\d+)_(\d+)$/.exec(version);
    const source = releaseLabel
        ? `O*NET ${releaseLabel[1]}.${releaseLabel[2]} database, CC BY 4.0, U.S. Department of Labor`
        : ONET_LICENSE;

    return {
        schema: LEXICON_SCHEMA_VERSION,
        source,
        version,
        fetchedAt: Date.now(),
        count: terms.length,
        terms,
    };
}

function mergeLexicons(base, update) {
    const map = new Map();
    const ingest = (lexicon) => {
        for (const term of lexicon?.terms || []) {
            const existing = map.get(normalizeSkillKey(term.name));
            if (!existing) {
                map.set(normalizeSkillKey(term.name), {
                    name: term.name,
                    category: term.category || 'general',
                    hot: !!term.hot,
                    inDemand: !!term.inDemand,
                    aliases: [...(term.aliases || [])],
                });
                continue;
            }
            existing.hot = existing.hot || !!term.hot;
            existing.inDemand = existing.inDemand || !!term.inDemand;
            if (existing.category === 'general' && term.category) existing.category = term.category;
            for (const alias of term.aliases || []) {
                if (!existing.aliases.some((value) => normalizeSkillKey(value) === normalizeSkillKey(alias))) {
                    existing.aliases.push(alias);
                }
            }
        }
    };
    ingest(base);
    ingest(update);
    applyCuratedAliases(map);
    const terms = termsFromMap(map).map((term) => ({
        name: term.name,
        category: term.category,
        hot: term.hot,
        inDemand: term.inDemand,
        aliases: term.aliases,
    }));
    return {
        schema: LEXICON_SCHEMA_VERSION,
        source: update?.source || base?.source || ONET_LICENSE,
        version: update?.version || base?.version || ONET_PINNED_RELEASE,
        fetchedAt: update?.fetchedAt || Date.now(),
        count: terms.length,
        terms,
    };
}

function compactLexicon(lexicon) {
    return {
        schema: lexicon?.schema || LEXICON_SCHEMA_VERSION,
        source: lexicon?.source || '',
        version: lexicon?.version || '',
        fetchedAt: lexicon?.fetchedAt || 0,
        count: lexicon?.count || (lexicon?.terms || []).length,
        terms: (lexicon?.terms || []).map((term) => [
            term.name,
            term.category || 'general',
            term.hot ? 1 : 0,
            term.inDemand ? 1 : 0,
            (term.aliases || []).join('|'),
        ]),
    };
}

function expandLexicon(compact) {
    if (!compact || !Array.isArray(compact.terms)) return null;
    if (Array.isArray(compact.terms[0])) {
        return {
            schema: compact.schema || LEXICON_SCHEMA_VERSION,
            source: compact.source || '',
            version: compact.version || '',
            fetchedAt: compact.fetchedAt || 0,
            count: compact.count || compact.terms.length,
            terms: compact.terms.map((entry) => ({
                name: entry[0],
                category: entry[1] || 'general',
                hot: entry[2] === 1,
                inDemand: entry[3] === 1,
                aliases: entry[4] ? String(entry[4]).split('|').filter(Boolean) : [],
            })),
        };
    }
    return compact;
}

function emptyLexicon() {
    return {
        schema: LEXICON_SCHEMA_VERSION,
        source: '',
        version: '',
        fetchedAt: 0,
        count: 0,
        terms: [],
    };
}

export {
    LEXICON_SCHEMA_VERSION,
    ONET_PINNED_RELEASE,
    parseOnetRelease,
    buildOnetUrls,
    ONET_ORIGIN,
    ONET_SOFTWARE_CSV,
    ONET_ESSENTIAL_CSV,
    ONET_TRANSFERABLE_CSV,
    ONET_LICENSE,
    CURATED_ALIASES,
    normalizeSkillKey,
    parseCsv,
    parseOnetSoftwareSkillsCsv,
    parseOnetSkillNamesCsv,
    buildLexiconFromOnet,
    mergeLexicons,
    compactLexicon,
    expandLexicon,
    emptyLexicon,
};
