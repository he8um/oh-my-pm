# @oh-my-pm/providers

Read-only context provider framework for OH MY PM.

The local provider is an in-memory provider over caller-supplied items. For the CLI `brief` command, the explicit Node CLI boundary in the CLI package reads Markdown project documents from the user-selected root and passes the resulting items into the local provider. This package itself performs no filesystem access: it never imports Node filesystem modules and only normalizes and serves the items it is given.
