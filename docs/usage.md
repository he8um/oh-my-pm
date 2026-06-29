# Usage

## Getting started

After installation, your AI agent will operate as a Head of Delivery.

## Trigger contexts

Use Oh My PM when you need to:

- Analyze a project or delivery situation
- Create or review a delivery plan
- Prioritize a backlog or feature set
- Review a PRD or requirements document
- Assess and manage risk
- Prepare a stakeholder update or status report
- Plan a product launch or marketing operation
- Run a retrospective
- Create an agent handoff prompt
- Diagnose delivery blockers or scope creep

## Example prompts

```txt
Diagnose the current state of this project and identify the top 3 risks.
```

```txt
Create a delivery plan for this feature based on the requirements below.
```

```txt
Review this PRD and flag any missing sections, unclear scope, or unresolved dependencies.
```

```txt
Write a stakeholder update for this week. Keep it executive-appropriate and under 300 words.
```

```txt
Prioritize this backlog using MoSCoW. Flag items that have unclear acceptance criteria.
```

## Using bilingual features

Write in Persian and the agent will respond in Persian with appropriate technical English terms preserved:

```txt
پروژه ما با تأخیر در تیم backend مواجه شده. وضعیت را تحلیل کن و یک plan جایگزین پیشنهاد بده.
```

## Using templates

Templates are in `templates/en/` and `templates/fa/`.

Reference them in your prompt:

```txt
Use the project-brief template to create a project brief for this initiative.
```

## Using playbooks

Playbooks are in `playbooks/`. They provide structured guidance for specific delivery scenarios.

## Related docs

- `docs/installation.md`
- `docs/bilingual-support.md`
- `docs/token-efficiency.md`
