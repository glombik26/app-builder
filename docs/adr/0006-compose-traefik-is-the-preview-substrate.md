# Previews and Environments run as Compose projects behind one Traefik

The Platform talks to Docker Compose directly on the one VPS. Each Preview is a Compose project; TEST and PROD later are further projects on the same engine. A Platform-owned Traefik on ports 80/443 is the only public ingress: routing comes from Docker labels (`exposedbydefault=false`), the frontend joins a shared proxy network, databases stay on the project network, and stacks do not publish host ports. Coolify and Dokploy were rejected because their built-in previews are PR lifecycles, not Feature stacks, and a second control plane would duplicate the Feature lifecycle the Platform already owns. Caddy and Nginx were rejected because both keep routing outside the stack, so every Preview would be a second write; Nginx would also import the other host's edge.

## Considered Options

- **Compose + Traefik; Platform owns up/down** (accepted)
- Coolify as the orchestrator
- Dokploy as the orchestrator
- Compose + Caddy
- Compose + Nginx (copy the other host's edge)
- CapRover
- Kamal
