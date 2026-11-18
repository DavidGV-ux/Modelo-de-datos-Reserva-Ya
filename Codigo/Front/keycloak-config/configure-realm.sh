#!/usr/bin/env bash
# Configura el realm `reserwaya` en el Keycloak alojado en AWS.
# Uso: ./configure-realm.sh <KC_BASE_URL> <FRONT_URL>
#   KC_BASE_URL  -> https://<keycloak-cf-domain>  (ej. https://d5mklesn5mbc7.cloudfront.net)
#   FRONT_URL    -> https://<front-cf-domain>     (ej. https://d1ydnh3hbo1zxr.cloudfront.net)
set -euo pipefail

KC="${1:?falta KC_BASE_URL}"
FRONT="${2:?falta FRONT_URL}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/secrets.env"

say() { printf '\n== %s\n' "$*"; }
api() { # api METHOD PATH [BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$KC$path" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$body"
  else
    curl -fsS -X "$method" "$KC$path" -H "Authorization: Bearer $TOKEN"
  fi
}

say "Token de administración (realm master)"
TOKEN=$(curl -fsS -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN}" -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

say "Realm reserwaya (registro propio del frontend, no el interno de Keycloak)"
if [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya")" != "200" ]; then
  api POST /admin/realms '{
    "realm": "reserwaya", "enabled": true, "displayName": "Reservas",
    "registrationAllowed": false, "registrationEmailAsUsername": false,
    "verifyEmail": false, "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false, "resetPasswordAllowed": true
  }' >/dev/null
  echo "realm creado"
else
  echo "realm ya existe"
fi

say "Tema de marca, idiomas y protección contra fuerza bruta"
api PUT /admin/realms/reserwaya '{
    "displayName": "ReservaYa",
    "loginTheme": "reservaya",
    "registrationAllowed": false,
    "internationalizationEnabled": true,
    "defaultLocale": "es",
    "supportedLocales": ["en", "es"],
    "bruteForceProtected": true,
    "maxFailureWaitSeconds": 900,
    "minimumQuickLoginWaitSeconds": 60,
    "waitIncrementSeconds": 60,
    "quickLoginCheckMilliSeconds": 1000,
    "maxDeltaTimeSeconds": 43200,
    "failureFactor": 30
  }' >/dev/null
echo "  loginTheme=reservaya, i18n es/en, registrationAllowed=false, brute force activa"

say "Roles de la app"
for r in ry_admin ry_owner ry_professional ry_client; do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/roles/$r")" != "200" ]; then
    api POST /admin/realms/reserwaya/roles "{\"name\": \"$r\"}" >/dev/null
    echo "  + $r"
  else
    echo "  = $r (ya existe)"
  fi
done

say "Default role: cualquier usuario registrado obtiene ry_client"
DEFROLE=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya" | python3 -c 'import sys,json;print(json.load(sys.stdin)["defaultRole"]["id"])' 2>/dev/null || true)
if [ -n "$DEFROLE" ]; then
  RYID=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/roles/ry_client" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
  if ! curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/roles-by-id/$DEFROLE/composites" | python3 -c "import sys,json;sys.exit(0 if any(r['name']=='ry_client' for r in json.load(sys.stdin)) else 1)"; then
    curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      "$KC/admin/realms/reserwaya/roles-by-id/$DEFROLE/composites" \
      -d "[{\"id\": \"$RYID\", \"name\": \"ry_client\"}]"
    echo "  ry_client compuesto en default-roles"
  else
    echo "  ry_client ya es compuesto en default-roles"
  fi
fi

say "Client reserwaya-web (público, PKCE)"
CLIENT_CFG="{
    \"clientId\": \"reserwaya-web\", \"name\": \"Reserwaya Web\", \"publicClient\": true,
    \"standardFlowEnabled\": true, \"directAccessGrantsEnabled\": false,
    \"redirectUris\": [\"http://localhost:4200/auth/callback\", \"$FRONT/auth/callback\"],
    \"webOrigins\": [\"http://localhost:4200\", \"$FRONT\"],
    \"attributes\": {\"pkce.code.challenge.method\": \"S256\"}
  }"
CLIENT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients?clientId=reserwaya-web" | python3 -c 'import sys,json;c=json.load(sys.stdin);print(c[0]["id"] if c else "")')
if [ -z "$CLIENT_ID" ]; then
  LOC=$(curl -fsS -D - -o /dev/null -X POST "$KC/admin/realms/reserwaya/clients" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$CLIENT_CFG" \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}')
  CLIENT_ID=$(basename "$LOC")
  echo "  creado: $CLIENT_ID"
else
  echo "  existe: $CLIENT_ID"
  api PUT "/admin/realms/reserwaya/clients/$CLIENT_ID" "$CLIENT_CFG" >/dev/null
fi

say "Mapper: realm_access.roles en id_token / access_token"
MAPPED=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients/$CLIENT_ID/protocol-mappers/models" | python3 -c 'import sys,json;print("yes" if any(m["name"]=="realm-roles-in-token" for m in json.load(sys.stdin)) else "")')
if [ "$MAPPED" != "yes" ]; then
  api POST "/admin/realms/reserwaya/clients/$CLIENT_ID/protocol-mappers/models" '{
    "name": "realm-roles-in-token", "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-realm-role-mapper",
    "config": {
      "claim.name": "realm_access.roles", "jsonType.label": "String", "multivalued": "true",
      "access.token.claim": "true", "id.token.claim": "true", "userinfo.token.claim": "true"
    }
  }' >/dev/null
  echo "  mapper creado"
else
  echo "  mapper ya existe"
fi

say "Mapper: audiencia target en access_token (reserwaya-web)"
AUD_MAP=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients/$CLIENT_ID/protocol-mappers/models" | python3 -c 'import sys,json;print("yes" if any(m["name"]=="reserwaya-web-aud" for m in json.load(sys.stdin)) else "")')
if [ "$AUD_MAP" != "yes" ]; then
  api POST "/admin/realms/reserwaya/clients/$CLIENT_ID/protocol-mappers/models" '{
    "name": "reserwaya-web-aud", "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "config": {
      "included.client.audience": "reserwaya-web",
      "access.token.claim": "true", "id.token.claim": "true"
    }
  }' >/dev/null
  echo "  mapper creado"
else
  echo "  mapper ya existe"
fi

say "Usuario administrador David (ry_admin)"
UIDS=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/users?username=David" | python3 -c 'import sys,json;print(" ".join(u["id"] for u in json.load(sys.stdin)))')
if [ -z "$UIDS" ]; then
  UID_D=$(api POST /admin/realms/reserwaya/users "{
    \"username\": \"${DAVID_USER}\", \"enabled\": true, \"emailVerified\": true,
    \"firstName\": \"David\", \"lastName\": \"Administrador\", \"email\": \"david@reserwaya.io\",
    \"credentials\": [{\"type\": \"password\", \"value\": \"${DAVID_PASSWORD}\", \"temporary\": false}]
  }" -o /dev/null -w '') || true
  UID_D=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/users?username=David" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
  echo "  creado: $UID_D"
else
  UID_D="${UIDS%% *}"
  echo "  existe: $UID_D"
fi
RY_ADMIN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/roles/ry_admin" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
api POST "/admin/realms/reserwaya/users/$UID_D/role-mappings/realm" "[{\"id\": \"$RY_ADMIN_ID\", \"name\": \"ry_admin\"}]" >/dev/null 2>&1 || true
echo "  ry_admin asignado"

say "Client reserwaya-back (confidencial, service account para admin REST)"
ISSUER_BASE="${KC%/}"
BC_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients?clientId=reserwaya-back" | python3 -c 'import sys,json;c=json.load(sys.stdin);print(c[0]["id"] if c else "")')
if [ -z "$BC_ID" ]; then
  LOC=$(curl -fsS -D - -o /dev/null -X POST "$KC/admin/realms/reserwaya/clients" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"clientId\": \"reserwaya-back\", \"name\": \"Reserwaya Backend\", \"enabled\": true,
         \"publicClient\": false, \"serviceAccountsEnabled\": true, \"standardFlowEnabled\": false,
         \"directAccessGrantsEnabled\": false}" \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}')
  BC_ID=$(basename "$LOC")
  echo "  client creado: $BC_ID"
else
  echo "  client existe: $BC_ID"
fi

say "Secreto del client reserwaya-back (guardado en secrets.env)"
BC_SECRET=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients/$BC_ID/client-secret" | python3 -c 'import sys,json;print(json.load(sys.stdin)["value"])' 2>/dev/null || true)
if [ -z "$BC_SECRET" ]; then
  BC_SECRET=$(curl -fsS -X POST -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients/$BC_ID/client-secret" | python3 -c 'import sys,json;print(json.load(sys.stdin)["value"])')
  echo "  secreto regenerado"
else
  echo "  secreto existente reutilizado"
fi
if [ -f "$DIR/secrets.env" ]; then
  sed -i '' '/^OIDC_ADMIN_CLIENT_SECRET=/d' "$DIR/secrets.env" || true
  echo "OIDC_ADMIN_CLIENT_SECRET='$BC_SECRET'" >> "$DIR/secrets.env"
  echo "  secrets.env actualizado"
else
  echo "  (no hay secrets.env, secreto por consola)" >&2
fi

SA_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/users?username=service-account-reserwaya-back&exact=true" | python3 -c 'import sys,json;u=json.load(sys.stdin);print(u[0]["id"] if u else "")')
if [ -n "$SA_ID" ]; then
  RM_CLIENT=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients?clientId=realm-management" | python3 -c 'import sys,json;c=json.load(sys.stdin);print(c[0]["id"] if c else "")')
  REALM_ADMIN=$(curl -s -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/reserwaya/clients/$RM_CLIENT/roles/realm-admin" | python3 -c 'import sys,json;r=json.load(sys.stdin);print(r["id"] if r else "")')
  if [ -n "$REALM_ADMIN" ]; then
    curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      "$KC/admin/realms/reserwaya/users/$SA_ID/role-mappings/clients/$RM_CLIENT" \
      -d "[{\"id\": \"$REALM_ADMIN\", \"name\": \"realm-admin\"}]" || true
    echo "  realm-admin asignado al service account"
  fi
fi

echo
echo "OK. Consola de admin:   $KC/admin   (${KEYCLOAK_ADMIN} pw en secrets.env)"
echo "    Usuario David:      $KC  (usuario David, pw en secrets.env)"
echo "    Back (admin REST): client reserwaya-back, secreto en secrets.env"