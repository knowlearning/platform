[X] make local harness launch multiple api servers
    [X] sticky sessions for clients
[X] implement strategy for test suite to test connections to different servers
[X] launch multiple redis instances for servers to connect to
[X] allow for configuration of domain -> redis instance
    [X] persistence.js and scope-to-id.js are the critical files to ensure instance routing is appropriate
[X] Migrate tests to easily automatable runners
[X] Add codex dev instance to development cluster in docker-compose
    [X] give access to logs and debugger access to main api processes
[X] launch multiple postgres instances for servers to connect to
    [X] already uses different database per domain within one instance - investigate easiest routing location to base instance selection
[X] allow for configuration of domain -> postgres db instance
[X] move postgres and redis placement declarations into domain config
    [X] keep old Redis copies after promotion for admin-managed cleanup
