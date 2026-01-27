#!/bin/bash
update_state() {
  local file=$1
  local progress=$2
  local insight=$3
  local status=$4
  
  jq --argjson progress "$progress" \
     --arg insight "$insight" \
     --arg status "$status" \
     --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
     '.progress = $progress | 
      .insights += [$insight] | 
      .updated_at = $now | 
      .last_heartbeat = $now |
      .status = $status' \
     "$file" > "${file}.tmp" && mv "${file}.tmp}"" "$file"
}
update_state "$@"
