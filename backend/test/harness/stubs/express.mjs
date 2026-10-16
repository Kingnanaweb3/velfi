// Records routes; tests call handlers directly with fake req/res.
function Router() {
  const routes = []
  const r = { routes }
  for (const m of ['get', 'post', 'patch', 'delete', 'put']) r[m] = (path, ...handlers) => { routes.push({ method: m, path, handlers }); return r }
  r.use = () => r
  return r
}
function express() { const app = Router(); app.listen = () => {}; return app }
express.Router = Router
express.json = () => (req, res, next) => next()
export default express
