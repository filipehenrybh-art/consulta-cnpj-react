import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePropertyRequest, officialUrlForService } from '../api/property-searches.js'

const validRequest = {
  cnpj: '12.345.678/0001-90',
  companyName: 'Empresa Demonstração Ltda.',
  serviceType: 'qualified',
  state: 'mg',
  city: '  Belo   Horizonte  ',
  purpose: 'supplier_analysis',
  legitimateUseConfirmed: true,
}

test('normaliza os dados usados para preparar uma pesquisa imobiliária', () => {
  assert.deepEqual(normalizePropertyRequest(validRequest), {
    cnpj: '12345678000190',
    companyName: 'Empresa Demonstração Ltda.',
    serviceType: 'qualified',
    state: 'MG',
    city: 'Belo Horizonte',
    purpose: 'supplier_analysis',
  })
})

test('exige confirmação de finalidade legítima', () => {
  assert.throws(
    () => normalizePropertyRequest({ ...validRequest, legitimateUseConfirmed: false }),
    /PROPERTY_CONFIRMATION_REQUIRED/,
  )
})

test('recusa serviço e localidade fora das opções permitidas', () => {
  assert.throws(
    () => normalizePropertyRequest({ ...validRequest, serviceType: 'scraping' }),
    /PROPERTY_SERVICE_INVALID/,
  )
  assert.throws(
    () => normalizePropertyRequest({ ...validRequest, state: 'Minas Gerais' }),
    /PROPERTY_STATE_INVALID/,
  )
})

test('direciona cada serviço para sua área específica no RI Digital', () => {
  assert.match(officialUrlForService('previous'), /\/PO\/DefaultPO\.aspx/)
  assert.match(officialUrlForService('qualified'), /\/CE\/DefaultCE\.aspx/)
  assert.match(officialUrlForService('registration_view'), /\/VisualizarMatricula\/DefaultVM\.aspx/)
  assert.match(officialUrlForService('digital_certificate'), /\/CertidaoDigital\/frmPedidosCertidao\.aspx/)
})
