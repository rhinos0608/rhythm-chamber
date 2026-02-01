# Refactoring Dashboard User Guide

## Overview

The Refactoring Progress Dashboard provides real-time tracking of all God object refactoring work in the Rhythm Chamber codebase. It combines a human-readable markdown dashboard with a machine-readable JSON tracker for automated monitoring.

## File Locations

- **Main Dashboard:** `/Users/rhinesharar/rhythm-chamber/docs/plans/refactoring-progress.md`
- **JSON Tracker:** `/Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json`
- **Quick Summary:** `/Users/rhinesharar/rhythm-chamber/docs/plans/DASHBOARD-SUMMARY.md`
- **Coordinator State:** `/Users/rhinesharar/rhythm-chamber/.state/dashboard-coordinator-20260126.json`

## Reading the Dashboard

### Status Summary Table

The main table shows all 6 God objects at a glance:

| Column          | Description                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------- |
| **ID**          | Unique identifier for the object                                                             |
| **Object Name** | File path and description                                                                    |
| **Status**      | Current state (Not Started, Analysis Complete, In Progress, Implementation Complete, Tested) |
| **Priority**    | HIGH/MEDIUM/LOW - indicates importance                                                       |
| **Risk**        | CRITICAL/MODERATE/LOW - indicates complexity and danger                                      |
| **Progress**    | Percentage complete (0-100%)                                                                 |
| **Agent**       | Agent assigned to this task                                                                  |
| **Details**     | Quick summary of current state                                                               |

### Status Values Explained

- **Not Started**: No work has begun on this object
- **Analysis Complete**: Initial analysis is done, a detailed plan may be available
- **In Progress**: Active refactoring work is underway
- **Implementation Complete**: Code changes are done but not yet tested
- **Tested**: Changes have been verified with tests
- **Blocked**: Work has stopped due to dependencies or issues

### Priority and Risk

**Priority:**

- **HIGH**: Critical functionality that impacts many parts of the codebase
- **MEDIUM**: Important functionality with moderate impact
- **LOW**: Lower priority items that can be deferred

**Risk:**

- **CRITICAL**: High risk of breaking changes, requires extensive testing
- **MODERATE**: Medium risk with some expected breaking changes
- **LOW**: Low risk with isolated changes or well-tested areas

## Using the JSON Tracker

The JSON tracker provides programmatic access to refactoring status:

```bash
# Get overall summary
jq '.summary' /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# Get status of all God objects
jq '.god_objects[] | {id, status, progress}' /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# Get status of support tasks
jq '.support_tasks[] | {id, status, progress}' /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# Get details for a specific object
jq '.god_objects[] | select(.id == "functions-index")' /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

## For Agents

### Claiming a Task

When you start working on a God object or support task:

1. **Update your agent state document** with your task assignment
2. **Update the JSON tracker** with your agent ID and initial status:

```bash
jq '.god_objects[] | select(.id == "your-object-id") |
    .agent_id = "your-agent-id" |
    .agent_assigned = "your-agent-name" |
    .status = "in_progress" |
    .progress = 0' \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json > \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp && \
    mv /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp \
       /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

### Reporting Progress

Update your progress every 30-60 seconds:

```bash
jq '.god_objects[] | select(.id == "your-object-id") |
    .progress = 50 |
    .insights += ["Your latest insight"] |
    .updated_at = now' \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json > \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp && \
    mv /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp \
       /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

### Completing a Task

When your work is complete:

```bash
jq '.god_objects[] | select(.id == "your-object-id") |
    .status = "implementation_complete" |
    .progress = 100 |
    .completed_at = now |
    .artifacts += ["path/to/your/artifact"]' \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json > \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp && \
    mv /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp \
       /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

### Reporting Blockers

If you encounter issues:

```bash
jq '.god_objects[] | select(.id == "your-object-id") |
    .status = "blocked" |
    .blockers += ["Description of blocker"]' \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json > \
    /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp && \
    mv /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json.tmp \
       /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

## For Dashboard Coordinator

### Monitoring Agents

The dashboard coordinator should:

1. **Check agent state documents every 30-60 seconds**

   ```bash
   ls -lt /Users/rhinesharar/rhythm-chamber/.state/*.json | head -20
   ```

2. **Update dashboard based on agent progress**
   - Read agent state documents
   - Extract progress, insights, blockers
   - Update JSON tracker
   - Regenerate markdown dashboard

3. **Alert on blockers or stalled agents**
   - Check for agents with status "blocked"
   - Identify agents not updating within 2x their heartbeat interval
   - Report issues to orchestrator

### Refreshing the Dashboard

To refresh the dashboard with latest data:

1. Read all agent state documents
2. Update JSON tracker with latest progress
3. Regenerate markdown dashboard from tracker
4. Update coordinator state document

## Quick Commands

### View Current Status

```bash
# Quick summary
cat /Users/rhinesharar/rhythm-chamber/docs/plans/DASHBOARD-SUMMARY.md

# Overall progress
jq '.summary' /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# All high-priority items
jq '.god_objects[] | select(.priority == "HIGH")' \
  /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# All blocked items
jq '.god_objects[] | select(.status == "blocked")' \
  /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json

# All completed items
jq '.god_objects[] | select(.status == "implementation_complete" or .status == "tested")' \
  /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json
```

### Monitor Progress

```bash
# Watch for changes
watch -n 30 'jq ".summary" /Users/rhinesharar/rhythm-chamber/.state/refactoring-tracker.json'

# See recent agent activity
tail -100 /Users/rhinesharar/rhythm-chamber/docs/plans/refactoring-progress.md | grep -A 5 "Agent Activity Log"
```

## Metrics Reference

### Completion Metrics

- **Total God Objects:** 6
- **Total Support Tasks:** 3
- **Overall Progress:** Calculated as average of all task progress

### Progress Calculation

```
Overall Progress = (Sum of all task progress) / (Total number of tasks)
```

Example:

```
(80 + 0 + 50 + 35 + 50 + 30 + 100 + 5 + 40) / 9 = 42%
```

### Status Flow

```
Not Started → Analysis Complete → In Progress → Implementation Complete → Tested
                           ↓
                       Blocked
```

## Best Practices

1. **Update Frequently**: Update your progress every 30-60 seconds
2. **Be Specific**: Provide meaningful insights, not just progress percentages
3. **Report Blockers Early**: Don't wait if you're stuck
4. **List Artifacts**: Document all files created during your work
5. **Maintain State**: Keep your agent state document current
6. **Use Atomic Updates**: Use temporary files when updating JSON to avoid corruption

## Troubleshooting

### Dashboard Not Updating

1. Check if JSON tracker exists and is valid
2. Verify coordinator agent is running
3. Check file permissions
4. Look for JSON syntax errors

### Agent Not Showing Progress

1. Verify agent state document exists
2. Check if agent is updating heartbeat
3. Ensure agent ID matches tracker entry
4. Look for termination signals

### JSON Tracker Corruption

1. Check for syntax errors with `jq .`
2. Restore from backup if available
3. Rebuild from agent state documents if needed

## Support

For questions or issues with the dashboard:

- Consult the dashboard coordinator agent
- Check agent state documents in `.state/`
- Review this guide and the main dashboard documentation
