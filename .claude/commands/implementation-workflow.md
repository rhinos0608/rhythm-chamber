---
description: implementation-workflow
---
```mermaid
flowchart TD
    start_node_default([Start])
    end_node_default([End])
    agent_1768917932896[agent-1768917932896]
    ifelse_1768917996403{If/Else:<br/>Conditional Branch}

    start_node_default --> agent_1768917932896
    agent_1768917932896 --> ifelse_1768917996403
    ifelse_1768917996403 -->|False| end_node_default
    ifelse_1768917996403 -->|True| end_node_default
```

## Workflow Execution Guide

Follow the Mermaid flowchart above to execute the workflow. Each node type has specific execution methods as described below.

### Execution Methods by Node Type

- **Rectangle nodes**: Execute Sub-Agents using the Task tool
- **Diamond nodes (AskUserQuestion:...)**: Use the AskUserQuestion tool to prompt the user and branch based on their response
- **Diamond nodes (Branch/Switch:...)**: Automatically branch based on the results of previous processing (see details section)
- **Rectangle nodes (Prompt nodes)**: Execute the prompts described in the details section below

### If/Else Node Details

#### ifelse_1768917996403(Binary Branch (True/False))

**Evaluation Target**: Breaking Bugs

**Branch conditions:**
- **True**: When condition is true, halt context crawl and give implementation guide
- **False**: When condition is false, continue until all architectural details are noted

**Execution method**: Evaluate the results of the previous processing and automatically select the appropriate branch based on the conditions above.
