#!/bin/bash
# Kong Administration Helper Script

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default to local development
KONG_ADMIN="${KONG_ADMIN_URL:-http://localhost:8001}"

# Check if Kong is accessible
check_kong() {
    if ! curl -f -s "$KONG_ADMIN/status" > /dev/null 2>&1; then
        echo -e "${RED}❌ Kong Admin API not accessible at $KONG_ADMIN${NC}"
        echo "For Railway: export KONG_ADMIN_URL=https://kong.railway.app:8001"
        exit 1
    fi
}

# Commands
case "$1" in
    status)
        echo -e "${BLUE}🔍 Kong Status${NC}"
        check_kong
        curl -s "$KONG_ADMIN/status" | jq '.'
        ;;

    services)
        echo -e "${BLUE}📋 Services${NC}"
        check_kong
        curl -s "$KONG_ADMIN/services" | jq '.data[] | {name, protocol, host, port, path}'
        ;;

    routes)
        echo -e "${BLUE}🛣️  Routes${NC}"
        check_kong
        curl -s "$KONG_ADMIN/routes" | jq '.data[] | {name, methods, paths, service: .service.name}'
        ;;

    upstreams)
        echo -e "${BLUE}🎯 Upstream Targets${NC}"
        check_kong
        curl -s "$KONG_ADMIN/upstreams/ogelfy-upstream/targets" | jq '.data[] | {target, weight, health}'
        ;;

    health)
        echo -e "${BLUE}💚 Upstream Health${NC}"
        check_kong
        curl -s "$KONG_ADMIN/upstreams/ogelfy-upstream/health" | jq '.'
        ;;

    plugins)
        echo -e "${BLUE}🔌 Plugins${NC}"
        check_kong
        curl -s "$KONG_ADMIN/plugins" | jq '.data[] | {name, enabled, service: .service.name}'
        ;;

    metrics)
        echo -e "${BLUE}📊 Prometheus Metrics${NC}"
        KONG_PROXY="${KONG_PROXY_URL:-http://localhost:8000}"
        curl -s "$KONG_PROXY/metrics"
        ;;

    config)
        echo -e "${BLUE}⚙️  Configuration${NC}"
        check_kong
        curl -s "$KONG_ADMIN/config" | jq '.'
        ;;

    reload)
        echo -e "${BLUE}🔄 Reloading Kong${NC}"
        check_kong
        # For DB-less mode, Kong automatically reloads on config change
        echo "DB-less mode: Kong reloads automatically when declarative config changes"
        echo "To force reload in Docker: docker-compose restart kong"
        echo "To force reload on Railway: railway service kong restart"
        ;;

    test)
        echo -e "${BLUE}🧪 Testing Kong Proxy${NC}"
        KONG_PROXY="${KONG_PROXY_URL:-http://localhost:8000}"

        echo -e "${YELLOW}Testing /health endpoint...${NC}"
        curl -s -w "\nHTTP Status: %{http_code}\n" "$KONG_PROXY/health" | jq '.' || echo "Failed"

        echo ""
        echo -e "${YELLOW}Testing /api/hello endpoint...${NC}"
        curl -s -w "\nHTTP Status: %{http_code}\n" "$KONG_PROXY/api/hello" | jq '.' || echo "Failed"

        echo ""
        echo -e "${YELLOW}Testing rate limiting (send 5 requests)...${NC}"
        for i in {1..5}; do
            echo -n "Request $i: "
            curl -s -o /dev/null -w "Status: %{http_code}, X-RateLimit-Remaining: %header{X-RateLimit-Remaining}\n" "$KONG_PROXY/api/hello"
        done
        ;;

    logs)
        echo -e "${BLUE}📜 Kong Logs${NC}"
        if command -v railway &> /dev/null; then
            railway service kong logs
        elif command -v docker-compose &> /dev/null; then
            docker-compose logs -f kong
        else
            echo "Not in Railway or Docker Compose environment"
        fi
        ;;

    help|*)
        echo -e "${BLUE}Kong Administration Helper${NC}"
        echo ""
        echo "Usage: $0 {command}"
        echo ""
        echo "Commands:"
        echo "  status      - Show Kong status"
        echo "  services    - List all services"
        echo "  routes      - List all routes"
        echo "  upstreams   - List upstream targets"
        echo "  health      - Show upstream health"
        echo "  plugins     - List plugins"
        echo "  metrics     - Show Prometheus metrics"
        echo "  config      - Show Kong configuration"
        echo "  reload      - Reload Kong (DB-less mode info)"
        echo "  test        - Test Kong proxy endpoints"
        echo "  logs        - Tail Kong logs"
        echo "  help        - Show this help"
        echo ""
        echo "Environment Variables:"
        echo "  KONG_ADMIN_URL  - Kong Admin API URL (default: http://localhost:8001)"
        echo "  KONG_PROXY_URL  - Kong Proxy URL (default: http://localhost:8000)"
        echo ""
        echo "Examples:"
        echo "  $0 status"
        echo "  $0 health"
        echo "  KONG_ADMIN_URL=https://kong.railway.app:8001 $0 services"
        ;;
esac
