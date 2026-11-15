#!/usr/bin/env bash
# Запускать в Oracle Cloud Shell (не на планшете).
# Создаёт VCN + public subnet + Always Free VM, открывает 80/443,
# вставляет наш SSH-ключ и печатает PUBLIC_IP.
set -euo pipefail
export OCI_CLI_REGION="${OCI_CLI_REGION:-eu-frankfurt-1}"

KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOo3x242oBjGxrA7dHQOxpl1lXDFlPrePBa2kVdfCjLS presence-oracle-deploy'
echo "$KEY" > /tmp/presence.pub

TENANCY="${OCI_CLI_TENANCY:-$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2);print $2;exit}' "$HOME/.oci/config")}"
[ -n "$TENANCY" ] || { echo "Не нашёл tenancy OCID"; exit 1; }
echo "Tenancy: $TENANCY"

echo "Создаю VCN..."
VCN=$(oci network vcn create --compartment-id "$TENANCY" --cidr-block 10.0.0.0/16 \
  --display-name presence-vcn --wait-for-state AVAILABLE \
  --query 'data.id' --raw-output)
echo "VCN: $VCN"

echo "Создаю public subnet..."
SUBNET=$(oci network subnet create --compartment-id "$TENANCY" --vcn-id "$VCN" \
  --cidr-block 10.0.0.0/24 --display-name presence-public \
  --wait-for-state AVAILABLE --query 'data.id' --raw-output)
echo "Subnet: $SUBNET"

echo "Открываю 80/443..."
SL=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-security-list-id"' --raw-output)
RULES=$(oci network security-list get --security-list-id "$SL" \
  --query 'data."ingress-security-rules"' --raw-output)
NEW=$(printf '%s' "$RULES" | jq -c '. + [
  {"protocol":"6","source":"0.0.0.0/0","isStateless":false,
   "tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
  {"protocol":"6","source":"0.0.0.0/0","isStateless":false,
   "tcpOptions":{"destinationPortRange":{"min":443,"max":443}}}
]')
oci network security-list update --security-list-id "$SL" \
  --ingress-security-rules "$NEW" --force >/dev/null
echo "Порты 80/443 открыты."

echo "Ищу Ubuntu 24.04..."
IMAGE=$(oci compute image list --compartment-id "$TENANCY" \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
  --shape "VM.Standard.A1.Flex" --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].id' --raw-output)
[ -n "$IMAGE" ] && [ "$IMAGE" != "null" ] || { echo "Не нашёл Ubuntu 24.04"; exit 1; }
echo "Image: $IMAGE"

INSTANCE=""
for AD in $(oci iam availability-domain list --query 'data[*].name' --raw-output | jq -r '.[]'); do
  echo "Пробую Ampere A1 в $AD..."
  if INSTANCE=$(oci compute instance launch --compartment-id "$TENANCY" \
    --availability-domain "$AD" --shape VM.Standard.A1.Flex \
    --shape-config '{"ocpus":1,"memoryInGBs":6}' --image-id "$IMAGE" \
    --subnet-id "$SUBNET" --assign-public-ip true --display-name presence \
    --ssh-authorized-keys-file /tmp/presence.pub --wait-for-state RUNNING \
    --query 'data.id' --raw-output 2>/tmp/presence-oci-error); then
    break
  fi
  cat /tmp/presence-oci-error
  INSTANCE=""
done

if [ -z "$INSTANCE" ]; then
  echo "Не удалось создать A1 (capacity). Попробуй позже или напиши — сделаем E2.1.Micro."
  exit 1
fi

IP=$(oci compute instance list-vnics --instance-id "$INSTANCE" \
  --query 'data[0]."public-ip"' --raw-output)
echo
echo "ГОТОВО. PUBLIC_IP=$IP"
echo "USER=ubuntu"
