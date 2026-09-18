import courseConfig from '../../course.config'

export default function Home() {
  return (
    <main>
      <h1>{courseConfig.site.name}</h1>
      <p>{courseConfig.site.tagline}</p>
    </main>
  )
}
