// scripts/test-formfill.mjs
// Deterministic Form Filler tests: saved-answer resolution, answer validation,
// and the resume -> application profile mapping. No framework, no network.
// Usage: npm run test:formfill

import assert from 'node:assert/strict';
import { resolveFormAnswers, normalizeFormAnswers, profileFromResume } from '../form-profile.js';

const profile = {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan@example.com',
    phone: '+1 512 555 0134',
    streetAddress: '400 Congress Ave',
    addressLine2: 'Apt 12',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'United States',
    salaryAmount: 120000,
    salaryCurrency: 'USD',
    salaryPeriod: 'Year',
    startDate: '2026-12-01',
    yearsExperience: 6,
    workAuthorized: 'Yes',
    needsSponsorship: 'No',
    over18: 'Yes',
    willingToRelocate: 'No',
    remotePreference: 'Hybrid',
    linkedin: 'https://linkedin.com/in/jordanlee',
    website: 'https://jordanlee.dev',
    github: 'https://github.com/jordanlee',
    eeoOptIn: false,
    eeo: {
        gender: '',
        race: '',
        hispanicLatino: 'No',
        veteran: 'No',
        disability: 'No',
    },
    customQA: [
        { id: 'q1', question: 'Do you have a portfolio we can review?', answer: 'Yes — jordanlee.dev' },
    ],
};

function field(overrides = {}) {
    return {
        id: 'pfabc123-1',
        tag: 'text',
        type: 'text',
        question: 'Question',
        options: null,
        maxLength: null,
        required: false,
        ...overrides,
    };
}

function answerFor(question, overrides = {}) {
    const result = resolveFormAnswers([field({ question, ...overrides })], profile);
    return result.resolved.length ? result.resolved[0].answer : null;
}

// --- Canonical matchers ---

assert.equal(answerFor('Full name'), 'Jordan Lee', 'full name is joined');
assert.equal(answerFor('First name'), 'Jordan', 'first name');
assert.equal(answerFor('Last name'), 'Lee', 'last name');
assert.equal(answerFor('Your name'), 'Jordan Lee', 'your name matches the full name matcher');
assert.equal(answerFor('Email address'), 'jordan@example.com', 'email');
assert.equal(answerFor('Phone number'), '+1 512 555 0134', 'phone');
assert.equal(answerFor('LinkedIn profile'), 'https://linkedin.com/in/jordanlee', 'linkedin');
assert.equal(answerFor('Current salary'), '$120,000 per year', 'salary questions use the salary formatter');
assert.equal(answerFor('City'), 'Austin', 'city');
assert.equal(answerFor('State or province'), 'TX', 'state');
assert.equal(answerFor('Postal code'), '78701', 'postal code');
assert.equal(answerFor('Years of experience'), '6', 'years of experience');
assert.equal(answerFor('Earliest start date'), '2026-12-01', 'start date');

assert.equal(answerFor('Are you legally authorized to work in the United States?'), 'Yes', 'work authorization');
assert.equal(answerFor('Will you now or in future require visa sponsorship?'), 'No', 'sponsorship');
assert.equal(answerFor('Are you 18 years of age or older?'), 'Yes', 'over 18');
assert.equal(answerFor('Are you willing to relocate for this role?'), 'No', 'relocation');
assert.equal(answerFor('Preferred work arrangement'), 'Hybrid', 'remote preference');

// --- Never invents ---

assert.equal(answerFor('Tell us about yourself'), null, 'open question stays unanswered');
assert.equal(answerFor('How did you hear about us?'), null, 'unknown question stays unanswered');
assert.equal(answerFor('What is your favorite programming language?'), null, 'no matching skill answer');

// --- Select and radio must match a real option ---

assert.equal(
    answerFor('Are you legally authorized to work?', { tag: 'select', options: ['Yes', 'No'] }),
    'Yes',
    'select answer matches an option'
);
assert.equal(
    answerFor('Are you legally authorized to work?', { tag: 'select', options: ['Authorized', 'Not authorized'] }),
    null,
    'select answer with no matching option stays unanswered'
);
assert.equal(
    answerFor('Do you require sponsorship?', { tag: 'radio', options: ['Yes', 'No'] }),
    'No',
    'radio answer matches an option'
);

// --- EEO is opt-in ---

assert.equal(answerFor('Gender'), null, 'EEO is not filled without opt-in');
const optedIn = { ...profile, eeoOptIn: true, eeo: { ...profile.eeo, gender: 'Non-binary' } };
assert.equal(
    resolveFormAnswers([field({ question: 'Gender' })], optedIn).resolved[0].answer,
    'Non-binary',
    'EEO fills after opt-in'
);

// --- Custom Q&A ---

assert.equal(
    answerFor('Do you have a portfolio we can review?'),
    'Yes — jordanlee.dev',
    'custom Q&A matches on the question text'
);
assert.equal(
    resolveFormAnswers(
        [field({ question: 'Do you have a portfolio we can review for your work?' })],
        profile
    ).resolved[0].answer,
    'Yes — jordanlee.dev',
    'custom Q&A matches by containment'
);
assert.equal(
    answerFor('Do you have a portfolio?'),
    'Yes — jordanlee.dev',
    'custom Q&A matches when the question is contained in the stored one'
);
assert.equal(
    answerFor('What is your favorite programming language?'),
    null,
    'custom Q&A does not match an unrelated question'
);

// --- Salary conversion ---

assert.equal(
    answerFor('What is your expected hourly pay?'),
    '$57.69 per hour',
    'yearly salary converts to an hourly rate'
);
assert.equal(
    answerFor('What is your expected monthly pay?'),
    '$10,000 per month',
    'yearly salary converts to a monthly rate'
);

// --- maxLength ---

assert.equal(
    answerFor('Portfolio URL', { tag: 'input', maxLength: 12 }),
    'https://jord',
    'answers are truncated to the field maxLength'
);
assert.equal(
    answerFor('Portfolio URL', { tag: 'select', options: ['https://jordanlee.dev'], maxLength: 12 }),
    'https://jordanlee.dev',
    'option answers are never truncated'
);

// --- normalizeFormAnswers ---

const cleaned = normalizeFormAnswers([
    { id: 'pfabc123-1', answer: '  Jordan Lee  ' },
    { id: 'pfabc123-1', answer: 'duplicate' },
    { id: 'not-an-id', answer: 'nope' },
    { id: 'pfabc123-2', answer: '' },
    { id: 'pfabc123-3', answer: 'kept' },
]);
assert.deepEqual(cleaned, [
    { id: 'pfabc123-1', answer: 'Jordan Lee' },
    { id: 'pfabc123-3', answer: 'kept' },
], 'only valid ids and non-empty answers survive');

// --- Determinism ---

const fields = [
    field({ id: 'pfabc123-1', question: 'Full name' }),
    field({ id: 'pfabc123-2', question: 'Email address' }),
    field({ id: 'pfabc123-3', question: 'Tell us about yourself' }),
];
const runOne = resolveFormAnswers(fields, profile);
const runTwo = resolveFormAnswers(fields, profile);
assert.deepEqual(runOne, runTwo, 'resolution is deterministic');
assert.equal(runOne.cachedCount, 2, 'two fields resolved');
assert.equal(runOne.unresolved.length, 1, 'one field left for the user');

// --- Resume -> application profile ---

const resume = {
    name: 'Ada Byron Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'Austin, TX, United States',
    links: [
        { label: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
        { label: 'GitHub', url: 'https://github.com/ada' },
        { label: 'Site', url: 'https://ada.dev' },
    ],
    experience: [
        { title: 'Engineer', company: 'Acme', period: '2020 - Present' },
        { title: 'Intern', company: 'Beta', period: '2018 - 2019' },
    ],
};

const mapped = profileFromResume(resume, { now: new Date('2026-01-01T00:00:00Z') });
assert.equal(mapped.firstName, 'Ada Byron', 'name splits on the last word');
assert.equal(mapped.lastName, 'Lovelace', 'last name');
assert.equal(mapped.email, 'ada@example.com', 'email is carried over');
assert.equal(mapped.phone, '555-0100', 'phone is carried over');
assert.equal(mapped.city, 'Austin', 'city');
assert.equal(mapped.state, 'TX', 'state');
assert.equal(mapped.country, 'United States', 'country');
assert.equal(mapped.linkedin, 'https://linkedin.com/in/ada', 'linkedin link');
assert.equal(mapped.github, 'https://github.com/ada', 'github link');
assert.equal(mapped.website, 'https://ada.dev', 'website link');
assert.equal(mapped.yearsExperience, 8, 'years of experience comes from the earliest start');
assert.equal(mapped.streetAddress, '', 'street address is not invented');
assert.equal(mapped.workAuthorized, undefined, 'work authorization is never derived');
assert.equal(mapped.eeo, undefined, 'EEO answers are never derived');

const mappedAgain = profileFromResume(resume, { now: new Date('2026-01-01T00:00:00Z') });
assert.deepEqual(mapped, mappedAgain, 'profile mapping is deterministic');

const remote = profileFromResume({ name: 'Solo', location: 'Remote' }, { now: new Date('2026-01-01T00:00:00Z') });
assert.equal(remote.city, '', 'a remote location has no city');
assert.equal(remote.state, '', 'a remote location has no state');

console.log('form fill tests passed');
