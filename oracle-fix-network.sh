#!/usr/bin/env bash
# Запускать в Oracle Cloud Shell после oracle-cloud-shell.sh.
# Добавляет Internet Gateway, маршрут 0.0.0.0/0 и порты 22/80/443.
set -euo pipefail
export OCI_CLI_REGION="${OCI_CLI_REGION:-eu-frankfurt-1}"

CONFIG="${OCI_CLI_CONFIG_FILE:-${OCI_CONFIG_FILE:-$HOME/.oci/config}}"
read_tenancy() {
  awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2);print $2;exit}' "$1" 2>/dev/null || true
}
TENANCY="${TENANCY:-${OCI_CLI_TENANCY:-}}"
if [ -z "$TENANCY" ] && [ -e "$CONFIG" ]; then
  TENANCY="$(read_tenancy "$CONFIG")"
  if [ -z "$TENANCY" ]; then
    TENANCY="$(sudo -n awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2);print $2;exit}' "$CONFIG" 2>/dev/null || true)"
  fi
fi
[ -n "$TENANCY" ] || { echo "Не прочитал tenancy из $CONFIG"; exit 1; }

VCN=$(oci network vcn list --compartment-id "$TENANCY" --display-name presence-vcn \
  --query 'data[0].id' --raw-output)
[ -n "$VCN" ] && [ "$VCN" != "null" ] || { echo "Не нашёл presence-vcn"; exit 1; }
echo "VCN: $VCN"

IGW=$(oci network internet-gateway list --compartment-id "$TENANCY" --vcn-id "$VCN" \
  --display-name presence-igw --query 'data[0].id' --raw-output 2>/dev/null || true)
if [ -z "$IGW" ] || [ "$IGW" = "null" ]; then
  echo "Создаю Internet Gateway..."
  IGW=$(oci network internet-gateway create --compartment-id "$TENANCY" --vcn-id "$VCN" \
    --is-enabled true --display-name presence-igw --wait-for-state AVAILABLE \
    --query 'data.id' --raw-output)
fi
echo "IGW: $IGW"

RT=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"' --raw-output)
RULES=$(oci network route-table get --rt-id "$RT" --query 'data."route-rules"' --raw-output)
NEW=$(printf '%s' "$RULES" | jq -c --arg igw "$IGW" '
  if any(.[]; .destination=="0.0.0.0/0")
  then .
  else . + [{"destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","networkEntityId":$igw}]
  end')
oci network route-table update --rt-id "$RT" --route-rules "$NEW" --force >/dev/null
echo "Маршрут 0.0.0.0/0 -> IGW добавлен."

SL=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-security-list-id"' --raw-output)
RULES=$(oci network security-list get --security-list-id "$SL" \
  --query 'data."ingress-security-rules"' --raw-output)
NEW=$(printf '%s' "$RULES" | jq -c '
  . as $r
  | [22,80,443] as $ports
  | reduce $ports[] as $p ($r;
      if any(.[]; .protocol=="6" and .source=="0.0.0.0/0"
              and .tcpOptions.destinationPortRange.min==$p)
      then .
      else . + [{"protocol":"6","source":"0.0.0.0/0","isStateless":false,
                 "tcpOptions":{"destinationPortRange":{"min":$p,"max":$p}}}]
      end)')
oci network security-list update --security-list-id "$SL" \
  --ingress-security-rules "$NEW" --force >/dev/null
echo "Порты 22/80/443 открыты."
echo "NETWORK_FIXED"
