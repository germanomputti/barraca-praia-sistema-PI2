
const request = require('supertest');
const app = require('../server');
describe('API basic', ()=>{
  it('GET /api/products should return 200', async ()=>{
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(200);
  }, 10000);

  it('POST /api/pedidos creates order', async ()=>{
    const payload = { cliente:'Teste', numero_mesa:'1', items:[{ product_name:'Água de coco', option_name:'Sem gelo', quantidade:1, price_unit:10 }] };
    const res = await request(app).post('/api/pedidos').send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id');
  }, 20000);
});
