export const PAGE_TITLE = 'Senior Frontend Engineer at Northwind';
export const PAGE_URL = 'https://jobs.northwind.dev/senior-frontend-engineer';

export const resumeJson = JSON.stringify({
    name: 'Maya Chen',
    subtitle: 'Senior Frontend Engineer',
    position: 'Senior Frontend Engineer',
    company: 'Northwind',
    location: 'San Francisco, CA',
    contact: 'maya.chen@hey.com | (415) 555-0192 | linkedin.com/in/mayachen | github.com/mayachen',
    summary: 'Frontend engineer with 7 years of experience building design systems and data-heavy interfaces used by millions. Shipped the component library behind two Series B products and cut page load times by 40%+. I care about fast, accessible UI that teams can build on without fighting it.',
    skills: ['TypeScript', 'React', 'Next.js', 'GraphQL', 'Tailwind CSS', 'Design Systems', 'Accessibility (WCAG)', 'Performance Profiling', 'Vite', 'Playwright', 'Storybook', 'CI/CD'],
    experience: [
        {
            title: 'Senior Frontend Engineer',
            company: 'Brightline',
            location: 'San Francisco, CA',
            period: '2022 - Present',
            points: [
                'Led the design system rewrite (React + TypeScript) adopted by 6 product teams, cutting new-feature UI time from 2 weeks to 3 days',
                'Cut Largest Contentful Paint 43% via route-level code splitting, image pipeline rework, and bundle analysis in CI',
                'Shipped a WYSIWYG report builder used by 90k monthly users, with keyboard-first editing and full screen-reader support',
                'Mentored 4 engineers; instituted the accessibility review that took the app from 61 to 98 Lighthouse a11y score'
            ]
        },
        {
            title: 'Frontend Engineer',
            company: 'Parcelly',
            location: 'Remote',
            period: '2020 - 2022',
            points: [
                'Built the real-time tracking dashboard (React, GraphQL subscriptions) handling 2M+ events/day at p95 under 100ms re-render',
                'Migrated 140k lines of JS to TypeScript incrementally with zero downtime, enabling dead-code elimination of 18% of the bundle',
                'Introduced Playwright e2e coverage on critical flows, dropping regression incidents from 3-4 per quarter to under 1'
            ]
        },
        {
            title: 'Software Engineer',
            company: 'Fable & Co.',
            location: 'New York, NY',
            period: '2018 - 2020',
            points: [
                'Shipped the customer-facing storefront refresh for a 400k-user ecommerce platform, lifting mobile conversion 11%',
                'Owned the checkout flow rewrite; reduced cart abandonment 8% by cutting steps and adding inline validation'
            ]
        }
    ],
    projects: [
        {
            title: 'Gridworks',
            platform: 'Open Source - 4.2k GitHub stars',
            period: '2023 - Present',
            points: [
                'Headless React data-grid library focused on accessibility; used in production by 30+ companies',
                'Virtualized rendering keeps 100k-row datasets at 60fps with a 12kb gzipped core'
            ]
        },
        {
            title: 'Typefish',
            platform: 'Dev Tool',
            period: '2021',
            points: [
                'CLI that generates TypeScript types from live GraphQL APIs; 1.8k weekly npm downloads'
            ]
        }
    ],
    education: [
        {
            degree: 'B.S. Computer Science',
            school: 'University of California, Berkeley',
            year: '2018'
        }
    ],
    certifications: ['AWS Certified Developer - Associate (2023)'],
    skillGroups: [
        { label: 'Languages', items: ['TypeScript', 'JavaScript (ES2023)', 'HTML', 'CSS'] },
        { label: 'Frameworks', items: ['React', 'Next.js', 'Vite', 'Node.js', 'GraphQL'] },
        { label: 'Craft', items: ['Design Systems', 'Accessibility (WCAG 2.2)', 'Performance Profiling', 'Testing (Playwright, Vitest)'] },
        { label: 'Platform', items: ['CI/CD', 'Storybook', 'Figma', 'AWS'] }
    ]
});

export const coverLetterJson = JSON.stringify({
    applicant_name: 'Maya Chen',
    applicant_contact: 'maya.chen@hey.com | (415) 555-0192 | linkedin.com/in/mayachen',
    date: 'September 4, 2026',
    recipient_name: 'Hiring Manager',
    recipient_title: 'Engineering',
    company_name: 'Northwind',
    company_address: 'San Francisco, CA',
    greeting: 'Dear Hiring Manager,',
    opening_paragraph: 'I am applying for the Senior Frontend Engineer role at Northwind. Your team is rebuilding the analytics workspace, and that is exactly the kind of surface I have spent the last seven years making fast and pleasant to use.',
    body_paragraphs: [
        'At Brightline I led the design system rewrite that six product teams now build on, and I own the report builder that 90k people use every month. Both projects were about the same thing Northwind is solving: interfaces that stay quick and coherent as the data underneath them grows. Cutting our Largest Contentful Paint by 43 percent taught me where the real costs hide, and the accessibility program I instituted took us from a 61 to a 98 Lighthouse score.',
        'What draws me to Northwind specifically is the craft bar. The product feels considered in a way most dashboards do not, and your engineering blog suggests the team treats frontend performance as a feature, not an afterthought. I would like to help raise that bar further.'
    ],
    closing_paragraph: 'I would welcome the chance to talk about how I can contribute to the workspace team. Thank you for your time and consideration.',
    sign_off: 'Best regards,'
});

export const trackerApplications = (() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return [
        { id: 'a_seed_01', company: 'Northwind', role: 'Senior Frontend Engineer', url: 'https://jobs.northwind.dev/senior-frontend-engineer', recruiterName: 'Dana K.', recruiterEmail: '', status: 'saved', dateSaved: now - 0.2 * day, appliedDate: null, interviewDate: null, notes: 'Tailored with PocketResume - FAANG layout.', resumeIdUsed: null, resumeStyle: 'faang', source: 'ai', updatedAt: now - 0.2 * day },
        { id: 'a_seed_02', company: 'Figma', role: 'Design Engineer', url: 'https://figma.com/careers/design-engineer', recruiterName: '', recruiterEmail: '', status: 'saved', dateSaved: now - 1 * day, appliedDate: null, interviewDate: null, notes: '', resumeIdUsed: null, resumeStyle: 'professional', source: 'ai', updatedAt: now - 1 * day },
        { id: 'a_seed_03', company: 'Linear', role: 'Product Engineer', url: 'https://linear.app/careers/product-engineer', recruiterName: 'Karri S.', recruiterEmail: '', status: 'applied', dateSaved: now - 6 * day, appliedDate: now - 5 * day, interviewDate: null, notes: '', resumeIdUsed: null, resumeStyle: 'deedy', source: 'ai', updatedAt: now - 5 * day },
        { id: 'a_seed_04', company: 'Stripe', role: 'Senior Frontend Engineer', url: 'https://stripe.com/jobs/senior-frontend', recruiterName: '', recruiterEmail: '', status: 'applied', dateSaved: now - 9 * day, appliedDate: now - 8 * day, interviewDate: null, notes: '', resumeIdUsed: null, resumeStyle: 'professional', source: 'ai', updatedAt: now - 8 * day },
        { id: 'a_seed_05', company: 'Vercel', role: 'Solutions Architect', url: 'https://vercel.com/careers/solutions-architect', recruiterName: '', recruiterEmail: '', status: 'applied', dateSaved: now - 12 * day, appliedDate: now - 11 * day, interviewDate: null, notes: '', resumeIdUsed: null, resumeStyle: null, source: 'manual', updatedAt: now - 11 * day },
        { id: 'a_seed_06', company: 'Notion', role: 'Full Stack Engineer', url: 'https://notion.so/careers/fullstack', recruiterName: 'Priya M.', recruiterEmail: '', status: 'interview', dateSaved: now - 18 * day, appliedDate: now - 16 * day, interviewDate: now + 3 * day, notes: 'Recruiter screen done. Technical round Thursday.', resumeIdUsed: null, resumeStyle: 'faang', source: 'ai', updatedAt: now - 2 * day, interviews: [{ round: 1, date: now - 4 * day }] },
        { id: 'a_seed_07', company: 'Anthropic', role: 'Full Stack Engineer', url: 'https://anthropic.com/careers/fullstack', recruiterName: '', recruiterEmail: '', status: 'interview', dateSaved: now - 22 * day, appliedDate: now - 20 * day, interviewDate: now + 6 * day, notes: '', resumeIdUsed: null, resumeStyle: 'academic-cv', source: 'ai', updatedAt: now - 3 * day, interviews: [{ round: 2, date: now - 6 * day }] },
        { id: 'a_seed_08', company: 'Raycast', role: 'Software Engineer', url: 'https://raycast.com/careers/software-engineer', recruiterName: '', recruiterEmail: '', status: 'offer', dateSaved: now - 30 * day, appliedDate: now - 28 * day, interviewDate: now - 8 * day, notes: 'Offer received! Deadline next Friday.', resumeIdUsed: null, resumeStyle: 'deedy', source: 'ai', updatedAt: now - 1 * day, interviews: [{ round: 3, date: now - 9 * day }] }
    ];
})();

export const mockApplicationAnswers = {
    firstName: 'Maya',
    lastName: 'Chen',
    email: 'maya.chen@hey.com',
    phone: '(415) 555-0192',
    linkedin: 'linkedin.com/in/mayachen',
    location: 'San Francisco, CA',
    experience: '7',
    authorization: 'Yes, I am authorized to work in the U.S.',
    salary: '$165,000 - $185,000',
    why: 'I have spent the last four years building design systems and data-heavy dashboards, including the component library six teams at Brightline now ship with. Northwind\\u2019s analytics workspace is the kind of surface I most enjoy making fast and accessible, and your engineering blog tells me performance is treated as a feature here. I would love to help raise that bar.',
    source: 'A teammate mentioned the workspace team, and I have followed the product since the 2024 launch'
};
