# Orinadus Waitlist Intake Specification

This document defines the minimum waitlist fields needed to learn who should be prioritized and why.

## Goals

1. Segment demand by user type and workflow complexity.
2. Distinguish immediate onboarding demand from future dashboard demand.
3. Identify early design partners for hosted features.
4. Capture language preferences for multilingual rollout planning.

## Form Fields (V1)

## Required

1. Work email
2. Name
3. Primary role
- Solo builder
- Developer
- Team lead
- Product/operations
- Researcher
- Other

4. Team size
- 1
- 2-5
- 6-20
- 21-100
- 100+

5. Current tool mix (multi-select)
- Claude
- Copilot
- Gemini
- Codex
- Cursor
- VS Code
- Shell/CLI workflows
- Browser AI tools
- Self-hosted/local models
- Other

6. Main pain point (single choice)
- I keep repeating context across tools
- I lose track of decisions and changes
- My team context is fragmented
- I need searchable memory across workflows
- I want agent activity visibility

7. What they want first (single choice)
- Better onboarding into Urchin now
- Hosted dashboard views
- Chat assistant over memory
- Visual graph of linked context
- Team management and controls

## Optional but high value

1. Top 1-2 workflows they run weekly (short text)
2. Where they run most work
- Local machine
- Cloud/VPS
- Both

3. Preferred language for product interface
4. Interest level for design partner program (yes/no)
5. Consent for follow-up interview (yes/no)

## Scoring Model (Simple Prioritization)

Assign 0-3 points per category.

1. Urgency signal
- Daily pain with fragmented context = 3
- Weekly pain = 2
- Occasional pain = 1

2. Integration complexity
- Uses 4+ tools across local/remote = 3
- Uses 2-3 tools = 2
- Uses one primary tool = 1

3. Expansion potential
- Team lead or organization with active workflow = 3
- Small team or power solo = 2
- Casual solo = 1

4. Product fit alignment
- Wants onboarding + dashboard progression = 3
- Wants only one niche feature = 1-2

Use total score to tag leads:
- 10-12: High priority design partner
- 7-9: Early beta candidate
- 4-6: General launch cohort

## Recommended Tags to Store

- role
- team_size
- tools_used
- top_pain
- first_requested_feature
- language_preference
- hosting_mode_local_cloud
- design_partner_interest
- interview_consent
- priority_score

## Messaging on Waitlist Form

Headline:
Get early access to Orinadus.

Subhead:
Urchin is open source now. Orinadus is the hosted layer for managing your connected brain, projects, and agents.

Trust line:
We only use this information to prioritize roadmap and onboarding.

## Follow-up Sequence

1. Immediate confirmation email
- Set expectations: onboarding and access are phased.
- Give Urchin OSS link for immediate action.

2. Segment-specific follow-up
- High priority leads: invite to short interview or pilot.
- General cohort: share roadmap checkpoints and access windows.

3. Monthly update cadence
- What shipped
- What moved into beta
- What is next
