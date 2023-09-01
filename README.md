# Example Licensing Portal

This is an example of how to set up a simple customer-facing license activation
portal using Keygen's API and React.

![screenshot](https://github.com/keygen-sh/example-react-licensing-portal/assets/6979737/40c13d97-fc95-4d72-b62e-ef6c35cbeaba)

The portal offers the following functionality:

- License information e.g. expiration date.
- Machine activation.
- Machine deactivation.

## Running the example

First up, configure a few environment variables:

```bash
# Your Keygen account ID. Find yours at https://app.keygen.sh/settings.
export KEYGEN_ACCOUNT_ID="1fddcec8-8dd3-4d8d-9b16-215cac0f9b52"
```

You can either run each line above within your terminal session before
starting the app, or you can add the above contents to your `~/.bashrc`
file and then run `source ~/.bashrc` after saving the file.

Next, install dependencies with [`yarn`](https://yarnpkg.comg):

```bash
yarn
```

Finally, boot the example portal app:

```bash
yarn start
```

The app will be available at `http://localhost:1234`.

## Demo credentials

To run on the `demo` account, run the following:

```bash
KEYGEN_ACCOUNT_ID=demo yarn start
```

Then input the following demo license key:

```
8A1B58-B62874-E280BF-C6DE7D-5795DC-V3
```

## Fingerprinting

The example stores a random UUID to local storage to identify the current
device. This can be changed to a more sophisticated fingerprinting
strategy if required, e.g. device GUID or hardware ID.

To reset your fingerprint, run the following in the browser console:

```js
localStorage.clear()
```

This will allow you to test activation limits more easily.

## Questions?

Reach out at [support@keygen.sh](mailto:support@keygen.sh) if you have any
questions or concerns!
