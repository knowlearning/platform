[X] make local harness launch multiple api servers
    [X] sticky sessions for clients
[ ] implement strategy for test suite to test connections to different servers
[ ] launch multiple redis instances for servers to connect to
[ ] allow for configuration of domain -> redis instance
    [ ] persistence.js and scope-to-id.js are the critical files to ensure instance routing is appropriate
[ ] launch multiple postgres instances for servers to connect to
    [ ] already uses different database per domain within one instance - investigate easiest routing location to base instance selection
[ ] allow for configuration of domain -> postgres db instance
