import React from 'react'
import ReactDOM from 'react-dom'
import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { detect } from 'detect-browser'
const browser = detect()

/**
 * API client
 */
const KEYGEN_ACCOUNT_ID = process.env['KEYGEN_ACCOUNT_ID']

if (!KEYGEN_ACCOUNT_ID) {
  throw Error('environment variable KEYGEN_ACCOUNT_ID is required')
}

const client = {
  KEYGEN_ACCOUNT_ID,

  async validateLicenseKeyWithFingerprint(key, fingerprint) {
    const res = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses/actions/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Keygen-Version': '1.2',
      },
      body: JSON.stringify({
        meta: {
          scope: { fingerprint, entitlements: ['PORTAL'] },
          key,
        },
      }),
    })

    const { meta, data, errors } = await res.json()

    return {
      meta,
      data,
      errors,
    }
  },

  async activateMachineForLicense(license, fingerprint, name, platform, browser, version) {
    const res = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `License ${license.attributes.key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Keygen-Version': '1.2',
      },
      body: JSON.stringify({
        data: {
          type: 'machine',
          attributes: {
            fingerprint,
            name,
            platform,
            metadata: {
              browser,
              version,
            }
          },
          relationships: {
            license: { data: { type: 'license', id: license.id } },
          },
        },
      }),
    })

    const { data, errors } = await res.json()

    return {
      data,
      errors,
    }
  },

  async deactivateMachineForLicense(license, id) {
    const res = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/machines/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `License ${license.attributes.key}`,
        'Accept': 'application/json',
        'Keygen-Version': '1.2',
      },
    })

    if (res.status === 204) {
      return {}
    }

    const { errors } = await res.json()

    return {
      errors,
    }
  },

  async listMachinesForLicense(license) {
    const res = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `License ${license.attributes.key}`,
        'Accept': 'application/json',
      },
    })

    const { data, errors } = await res.json()

    return {
      data,
      errors,
    }
  },
}

/**
 * State management
 */
const createEmitter = () => {
  const subscriptions = new Map()
  return {
    emit: v => subscriptions.forEach(fn => fn(v)),
    subscribe: fn => {
      const key = Symbol()
      const unsubscribe = () => subscriptions.delete(key)

      subscriptions.set(key, fn)

      return unsubscribe
    },
  }
}

// See: https://formidable.com/blog/2021/stores-no-context-api/
const createStore = init => {
  const emitter = createEmitter()

  let store = null
  const get = () => store
  const set = op => (store = op(store), emitter.emit(store))
  store = init(set, get)

  const useStore = () => {
    const [localStore, setLocalStore] = useState(get())

    useEffect(() => emitter.subscribe(setLocalStore), [])

    return localStore
  }

  return useStore
}

const getDeviceId = () => {
  let deviceId = window.localStorage.getItem('DEMO_DEVICE_ID')
  if (!deviceId) {
    deviceId = uuidv4()

    window.localStorage.setItem('DEMO_DEVICE_ID', deviceId)
  }

  return deviceId
}

const useLicensingStore = createStore((set, get) => ({
  fingerprint: getDeviceId(),
  key: '8A1B58-B62874-E280BF-C6DE7D-5795DC-V3',
  validation: null,
  license: null,
  machines: [],
  errors: [],

  setKey: key => set(state => ({ ...state, key })),

  validateLicenseKeyWithFingerprint: async () => {
    const { key, fingerprint, listMachinesForLicense } = get()

    const { meta, data, errors } = await client.validateLicenseKeyWithFingerprint(key, fingerprint)
    if (errors) {
      return set(state => ({ ...state, errors }))
    }

    set(state => ({ ...state, validation: meta, license: data }))

    // List machines for the license if it exists (regardless of validity)
    if (data != null) {
      listMachinesForLicense()
    }
  },

  activateMachineForLicense: async ({ name, platform, browser, version }) => {
    const { license, fingerprint, listMachinesForLicense, validateLicenseKeyWithFingerprint } = get()

    const { errors } = await client.activateMachineForLicense(license, fingerprint, name, platform, browser, version)
    if (errors) {
      // List machines to give the user the option to free up activation slots
      client.listMachinesForLicense()

      return set(state => ({ ...state, errors }))
    }

    // Clear errors if activation was successful
    set(state => ({ ...state, errors: [] }))

    // List machines
    listMachinesForLicense()

    // Revalidate the current license
    validateLicenseKeyWithFingerprint()
  },

  deactivateMachineForLicense: async id => {
    const { license, validateLicenseKeyWithFingerprint, listMachinesForLicense } = get()

    const { errors } = await client.deactivateMachineForLicense(license, id)
    if (errors) {
      return set(state => ({ ...state, errors }))
    }

    // Clear errors if deactivation was successful
    set(state => ({ ...state, errors: [] }))

    // Relist machines
    listMachinesForLicense()

    // Revalidate the current license
    validateLicenseKeyWithFingerprint()
  },

  listMachinesForLicense: async () => {
    const { license } = get()

    const { data, errors } = await client.listMachinesForLicense(license)
    if (errors) {
      return set(state => ({ ...state, errors }))
    }

    set(state => ({
      ...state,
      machines: data,
    }))
  },

  clearError: error => {
    const { errors } = get()

    set(state => ({ ...state, errors: errors.filter(e => e !== error) }))
  },

  reset: () => {
    set(state => ({
      ...state,
      key: null,
      validation: null,
      license: null,
      machines: [],
      errors: [],
    }))
  }
}))

const useDeviceInfoStore = createStore(() => ({
  platform: browser.os ?? window.navigator.platform,
  version: browser.version ?? window.navigator.appVersion,
  browser: browser.name ?? window.navigator.userAgent,
  name: `Demo Device ${uuidv4().substring(0, 5)}`,
}))

/**
 * Components
 */
const LicenseInfo = ({ showSeats = true }) => {
  const { license, machines, validation, reset } = useLicensingStore()
  const created = license?.attributes?.created?.split('T')?.[0]
  const expiry = license?.attributes?.expiry?.split('T')?.[0]

  return (
    <div className='demo-component'>
      <h2>
        <small>{license?.attributes?.name ?? 'License key'}</small>
        {license?.attributes?.key ?? 'N/A'}
        {validation?.valid
          ? <span className='demo-component__tag demo-component__tag--valid'>Valid</span>
          : <span className='demo-component__tag demo-component__tag--invalid'>Invalid</span>}
      </h2>
      <div className='demo-component__table'>
        <table>
          <thead>
            <tr>
              <th>Issued On</th>
              <th>Valid Until</th>
              {showSeats
                ? <th># Seats</th>
                : null}
              <th>Validation Code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {created ?? 'N/A'}
              </td>
              <td>
                {expiry ?? 'N/A'}
              </td>
              {showSeats
                ? <td>
                    <strong>{machines.length}/{license?.attributes?.maxMachines || 0}</strong>
                  </td>
                : null}
              <td>
                <code>{validation?.code}</code>
              </td>
              <td>
              <button className='demo-component__button demo-component__button--logout' type='button' onClick={e => reset()}>
                  Logout
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const DeviceActivationInput = ({ name, platform, browser, version, fingerprint, onSubmit }) => {
  return (
    <form onSubmit={e => (e.preventDefault(), onSubmit({ name, platform, browser, version }))}>
      <div className='demo-component__table'>
        <table>
          <thead>
            <tr>
              <th>Device Name</th>
              <th>Fingerprint</th>
              <th>Browser</th>
              <th>Version</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{name}</strong>
              </td>
              <td>
                <code>{fingerprint}</code>
              </td>
              <td>
                {browser}
              </td>
              <td>
                {version}
              </td>
              <td>
                <button className='demo-component__button demo-component__button--activate' type='submit'>
                  Activate
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>
  )
}

const LicenseActivator = () => {
  const { fingerprint, activateMachineForLicense } = useLicensingStore()
  const { name, platform, browser, version } = useDeviceInfoStore()

  return (
    <div className='demo-component'>
      <h3>
        <small>Activate Device</small>
        Your device has not been activated
      </h3>
      <DeviceActivationInput
        name={name}
        fingerprint={fingerprint}
        platform={platform}
        browser={browser}
        version={version}
        onSubmit={activateMachineForLicense}
      />
    </div>
  )
}

const LicenseErrors = () => {
  const { errors, clearError } = useLicensingStore()

  return (
    <div className='demo-component demo-component--alert'>
      <h3>
        <small>Licensing API</small>
        An error has occurred
      </h3>
      <div className='demo-component__table'>
        <table>
          <thead>
            <tr>
              <th>Error Title</th>
              <th>Code</th>
              <th>Message</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error, i) =>
              <tr key={i}>
                <td>
                  {error.title}
                </td>
                <td>
                  <code>{error.code ?? 'N/A'}</code>
                </td>
                <td>
                  {error.source != null
                    ? <><code>{error.source.pointer}</code> </>
                    : null}
                  {error.detail}
                </td>
                <td>
                  <button type='button' onClick={e => clearError(error)}>
                    Clear
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const LicenseManager = () => {
  const { license, fingerprint, machines, deactivateMachineForLicense } = useLicensingStore()
  const isActivated = machines.some(m => m.attributes.fingerprint === fingerprint)

  return (
    <div className='demo-component'>
      <h3>
        <small>Manage devices</small>
        Using {machines.length} of {license.attributes.maxMachines} seats
      </h3>
      <p className='demo-component__info'>
        The current device {isActivated ? <em>is</em> : <em>is not</em>} activated. Deactivate devices to free up seats.
      </p>
      <div className='demo-component__table'>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Device Name</th>
              <th>Browser</th>
              <th>Activated On</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {machines.map(machine =>
              <tr key={machine.id}>
                <td>
                  <code>{machine.id.slice(0, 8)}</code>
                </td>
                <td>
                  {machine.attributes.name}
                  {machine.attributes.fingerprint === fingerprint
                    ? <span className='demo-component__tag demo-component__tag--small'>Current</span>
                    : null}
                </td>
                <td>
                  {Object.keys(machine.attributes.metadata).length > 0
                    ? <span>
                        {machine.attributes.metadata.browser} {machine.attributes.metadata.version}
                      </span>
                    : null}
                </td>
                <td>
                  {machine.attributes.created.split('T')[0]}
                </td>
                <td>
                  <button className='demo-component__button demo-component__button--deactivate' type='button' onClick={e => deactivateMachineForLicense(machine.id)}>
                    Deactivate
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const LicenseKeyInput = ({ value, onChange, onSubmit }) => {
  return (
    <form onSubmit={e => (e.preventDefault(), onSubmit())}>
      <input type='text' placeholder='XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-V3' value={value ?? ''} onChange={e => onChange(e.target.value)} required={true} />
      <button type='submit'>
        Continue
      </button>
    </form>
  )
}

const LicenseValidator = () => {
  const { key, validateLicenseKey, validateLicenseKeyWithFingerprint, setKey } = useLicensingStore()
  const validateLicenseKeyAction = validateLicenseKeyWithFingerprint

  return (
    <div className='demo-component'>
      <h2>
        <small>License Portal Demo</small>
        Please enter a license key
      </h2>
      <LicenseKeyInput value={key} onChange={setKey} onSubmit={validateLicenseKeyAction} />
    </div>
  )
}

const LicenseActivationPortal = () => {
  const { license, validation, errors } = useLicensingStore()

  if (errors?.length) {
    return (
      <div className='demo' data-title='Demo App'>
        <LicenseErrors />
        <LicenseInfo />
        {errors.some(e => e.code === 'MACHINE_LIMIT_EXCEEDED')
          ? <LicenseManager />
          : null}
      </div>
    )
  }

  if (license == null && validation == null) {
    return (
      <div className='demo' data-title='Demo App'>
        <LicenseValidator />
      </div>
    )
  }

  if (validation?.valid) {
    return (
      <div className='demo' data-title='Demo App'>
        <LicenseInfo />
        <LicenseManager />
      </div>
    )
  }

  switch (validation?.code) {
    case 'FINGERPRINT_SCOPE_MISMATCH':
    case 'NO_MACHINES':
    case 'NO_MACHINE':
      return (
        <div className='demo' data-title='Demo App'>
          <LicenseInfo />
          <LicenseActivator />
        </div>
      )
    default:
      return (
        <div className='demo' data-title='Demo App'>
          <LicenseInfo />
        </div>
      )
  }
}

const root = document.getElementById('app-root')
if (root != null) {
  ReactDOM.render(<LicenseActivationPortal />, root)
}
