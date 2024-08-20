#
#  Set up auth callout
#
################################


nsc generate nkey --account # gives secret and public key

# create nats.conf

accounts {
  global_account: {
    jetstream: enabled
    users: [
      { nkey: UAKEFMDW6OPGHW3AO5SXYTQHJTIVS5SZZ6ORRBD64W7IR45WC3I7RJZX }
    ]
  }
}

authorization {
  auth_callout {
    issuer: # public key of nkey generated above
    auth_users: [ auth ]
    account: global_account
  }
}
