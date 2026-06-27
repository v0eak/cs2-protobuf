import { Octokit } from "@octokit/rest"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import {
    mkdir,
    readdir,
    readFile,
    writeFile
} from "node:fs/promises"
import { downloadTemplate } from "giget"
import prettier from "prettier"
import { rimraf } from "rimraf"
import { dedent } from "ts-dedent"

import packageJson from "../package.json"

const octokit = new Octokit()
const protocGenTsProtoPathBinary = process.argv[2]

const gameTrackingCS2CommitShaFileName = ".gametracking-cs2-sha"
const protobufExclusionsFileName = ".proto-exclusions"
const protobufsDir = "protobufs"
const typescriptDir = "src/generated"

const pullLatestGameTrackingCS2Protobufs = async () => {
    await rimraf(protobufsDir)

    const dir = await downloadTemplate(
        "gh:SteamTracking/GameTracking-CS2/Protobufs#master",
        {
            dir: protobufsDir,
            ignore: (path) => {
                return !path.endsWith(".proto")
            }
        }
    )
        .then(({ dir }) => {
            console.log("Pulled GameTracking-CS2 protobufs")
            return dir
        })
        .catch((err) => {
            console.error("Failed pulling GameTracking-CS2 protobufs")
            throw err
        })

    return await readdir(
        dir,
        {
            withFileTypes: true
        }
    )
        .then((items) => {
            console.log("Read GameTracking-CS2 protobuf filenames")
            return items
                .filter((item) => item.isFile())
                .map((file) => file.name)
        })
        .catch((err) => {
            console.error("Failed reading GameTracking-CS2 protobuf filenames")
            throw err
        })
}

const fetchLatestGameTrackingCS2CommitSHA = async () => {
    return await octokit.git.getRef({
        owner: "SteamTracking",
        repo: "GameTracking-CS2",
        ref: "heads/master"
    })
        .then(({ data }) => {
            console.log("Fetched latest GameTracking-CS2 SHA")
            return data.object.sha
        })
        .catch((err) => {
            console.error("Failed fetching latest GameTracking-CS2 SHA")
            throw err
        })
}

const getStoredGameTrackingCS2CommitSHA = async () => {
    return await readFile(gameTrackingCS2CommitShaFileName, "utf-8")
        .then((fileContents) => {
            console.log("Read stored GameTracking-CS2 SHA")
            return fileContents
        })
        .catch((err) => {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                console.error("Failed reading stored GameTracking-CS2 SHA")
                throw err
            }
            return ""
        })
}

const setStoredGameTrackingCS2CommitSHA = async (sha: string) => {
    return await writeFile(gameTrackingCS2CommitShaFileName, sha, "utf-8")
        .then(() => console.log("Wrote GameTracking-CS2 SHA"))
        .catch((err) => {
            console.error("Failed writing GameTracking-CS2 SHA")
            throw err
        })
}

const fetchLatestSteamTrackingProtobufFileNames = async () => {
    const owner = "SteamTracking"
    const repo = "SteamTracking"
    const path = "Protobufs"

    const data = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: "heads/master"
    })
        .then(({ data }) => {
            console.log("Fetched SteamTracking protobuf filenames")
            return data
        })
        .catch((err) => {
            console.error("Failed fetching SteamTracking protobuf filenames")
            throw err
        })

    if (!Array.isArray(data)) {
        throw new Error(`Expected directory at ${owner}/${repo}/${path} but GitHub returned non-directory content`)
    }

    return data
        .filter((item):
            item is Omit<
                typeof item,
                "type"
            > & {
                type: "file"
            } =>
                item.type === "file"
                && item.name.endsWith(".proto")
        )
        .map((file) => file.name)
}

const setStoredProtobufExclusions = async (protobufsToExclude: string[]) => {
    await writeFile(protobufExclusionsFileName, protobufsToExclude.join("\n"), "utf-8")
        .then(() => console.log("Wrote protobuf exclusions"))
        .catch((err) => {
            console.error("Failed writing protobuf exclusions")
            throw err
        })
}

const generateTypescript = async (protobufFileNames: string[]) => {
    await rimraf(typescriptDir)
    await mkdir(typescriptDir)

    const protoc = spawn("protoc", [
        "-I=protobufs",
        `--plugin=protoc-gen-ts_proto=${protocGenTsProtoPathBinary}`,
        "--ts_proto_opt=outputJsonMethods=false",
        "--ts_proto_opt=outputPartialMethods=false",
        "--ts_proto_opt=outputClientImpl=false",
        "--ts_proto_opt=exportCommonSymbols=false",
        "--ts_proto_opt=removeEnumPrefix=true",
        "--ts_proto_opt=esModuleInterop=true",
        "--ts_proto_opt=importSuffix=.js",
        "--ts_proto_opt=outputIndex=true",
        "--ts_proto_opt=emitImportedFiles=false",
        `--ts_proto_out=${typescriptDir}`,
        ...(protobufFileNames.map((protobufFileName) => `${protobufsDir}/${protobufFileName}`))
    ])

    const [code] = await once(protoc, "close")

    if (code !== 0) {
        throw new Error(`Typescript generation failed with code: ${code}`)
    }

    console.log("Generated Typescript")

    return await readdir(
        typescriptDir,
        {
            withFileTypes: true
        }
    )
        .then((items) => {
            console.log("Read generated Typescript filenames")
            return items
                .filter((item) => item.isFile() && item.name !== "index.ts")
                .map((file) => file.name)
        })
        .catch((err) => {
            console.error("Failed reading generated Typescript filenames")
            throw err
        })
}

const getGeneratedTypescript = async (fileName: string) => {
    return await readFile(`${typescriptDir}/${fileName}`, "utf-8")
        .then((fileContents) => {
            console.log(`Read generated Typescript filecontents ${fileName}`)
            return fileContents
        })
        .catch((err) => {
            console.error(`Failed reading generated Typescript filecontents ${fileName}`)
            throw err
        })
}

const setGeneratedTypescriptWrapper = async (fileName: string, fileContent: string) => {
    await writeFile(
        `${typescriptDir}/${fileName}`,
        await prettier.format(
            fileContent,
            {
                parser: "typescript",
                printWidth: 120
            }
        ),
        "utf-8"
    )
        .then(() => console.log(`Wrote generated Typescript wrapper ${fileName}`))
        .catch((err) => {
            console.error(`Failed writing generated Typescript wrapper ${fileName}`)
            throw err
        })
}

const generateGeneratedTypescriptWrappers = async (generatedTypescriptFileNames: string[]) => {
    const generatorComment = dedent(`
        // Code generated by cs2-protobuf. DO NOT EDIT.
        // versions:
        //   cs2-protobuf   ${packageJson.version}
    `)
    for (const generatedTypescriptFileName of generatedTypescriptFileNames) {
        const generatedTypescriptFileContent = await getGeneratedTypescript(generatedTypescriptFileName)
        const generatedTypescriptFileNameES =
            generatedTypescriptFileName.replace(".ts", ".js")
        const generatedTypescriptWrapperFileName =
            generatedTypescriptFileName.replace(".ts", ".wrapper.ts")

        const generatedTypescriptFileMessageNames = [
            ...generatedTypescriptFileContent
                .matchAll(
                    /export const (\w+): MessageFns<(\w+)>/g
                )
        ].map(m => m[1])

        const generatedTypescriptWrapperFileContent: {
            base: string[],
            imports: string[],
            interfaces: string[],
            messageFunctions: string[]
        } = {
            base: [
                generatorComment,
                dedent(`
                    // source: ${generatedTypescriptFileName}

                    /* eslint-disable */
                `),
                `export * from "./${generatedTypescriptFileNameES}"`
            ],
            imports: [],
            interfaces: [],
            messageFunctions: []
        }

        if (generatedTypescriptFileMessageNames.length === 0) {
            await setGeneratedTypescriptWrapper(
                generatedTypescriptWrapperFileName,
                generatedTypescriptWrapperFileContent.base.join("\n")
            )
            continue
        }

        for (const generatedTypescriptFileMessageName of generatedTypescriptFileMessageNames) {
            const generatedTypescriptFileMessageNameHash = createHash("sha1")
                .update(`${generatedTypescriptFileMessageName}`)
                .digest("hex")
                .slice(0, 8)
            const generatedTypescriptFileMessageNameImport =
                `${generatedTypescriptFileMessageName}_${generatedTypescriptFileMessageNameHash}`
            
            generatedTypescriptWrapperFileContent.imports.push(
                `${generatedTypescriptFileMessageName} as ${generatedTypescriptFileMessageNameImport}`,
                `type ${generatedTypescriptFileMessageName} as ${generatedTypescriptFileMessageNameImport}_type`
            )
            generatedTypescriptWrapperFileContent.interfaces.push(
                `export interface ${generatedTypescriptFileMessageName} extends ${generatedTypescriptFileMessageNameImport}_type {}`
            )
            generatedTypescriptWrapperFileContent.messageFunctions.push(
                dedent(`
                    export const ${generatedTypescriptFileMessageName} = {
                        encode(message: ${generatedTypescriptFileMessageName}): Uint8Array<ArrayBuffer> {
                            return ${generatedTypescriptFileMessageNameImport}.encode(message).finish()
                        },
                        decode(input: Uint8Array): ${generatedTypescriptFileMessageName} {
                            return ${generatedTypescriptFileMessageNameImport}.decode(input)
                        }
                    }
                `)
            )
        }

        await setGeneratedTypescriptWrapper(
            generatedTypescriptWrapperFileName,
            [
                generatedTypescriptWrapperFileContent.base.join("\n"),
                dedent(`
                    import {
                        ${generatedTypescriptWrapperFileContent.imports.join(",\n")}
                    } from "./${generatedTypescriptFileNameES}"
                `),
                generatedTypescriptWrapperFileContent.interfaces.join("\n"),
                generatedTypescriptWrapperFileContent.messageFunctions.join("\n\n")
            ].join("\n\n")
        )
    }

    await setGeneratedTypescriptWrapper(
        "index.wrapper.ts",
        [
            generatorComment,
            dedent(`

                /* eslint-disable */
            `),
            ...generatedTypescriptFileNames.map((generatedTypescriptFileName) => {
                const generatedTypescriptWrapperFileName =
                    generatedTypescriptFileName.replace(".ts", ".wrapper.ts")

                return dedent(`
                    export * from "./${generatedTypescriptWrapperFileName.replace(".ts", ".js")}"
                `)
            })
        ].join("\n")
    )
}

async function main() {
    const latestGameTrackingCS2CommitSHA = await fetchLatestGameTrackingCS2CommitSHA()
    const storedGameTrackingCS2CommitSHA = await getStoredGameTrackingCS2CommitSHA()

    if (latestGameTrackingCS2CommitSHA === storedGameTrackingCS2CommitSHA) {
        console.log("No changes detected")
        return
    }
    await setStoredGameTrackingCS2CommitSHA(latestGameTrackingCS2CommitSHA)

    const gameTrackingCS2ProtobufFileNames = await pullLatestGameTrackingCS2Protobufs()
    const steamTrackingProtobufFileNames = await fetchLatestSteamTrackingProtobufFileNames()

    const protobufsToExclude = gameTrackingCS2ProtobufFileNames
        .filter((gameTrackingCS2ProtobufFileName) =>
            steamTrackingProtobufFileNames.includes(gameTrackingCS2ProtobufFileName)
        )

    await setStoredProtobufExclusions(protobufsToExclude)

    const protobufsToInclude = gameTrackingCS2ProtobufFileNames
        .filter((gameTrackingCS2ProtobufFileName) =>
            !protobufsToExclude.includes(gameTrackingCS2ProtobufFileName)
        )

    const generatedTypescriptFileNames = await generateTypescript(protobufsToInclude)
    await generateGeneratedTypescriptWrappers(generatedTypescriptFileNames)
}

await main()